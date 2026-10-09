import { mkdir, rm, stat, unlink } from "node:fs/promises";
import { dirname, posix } from "node:path";

import type {
  MediaDerivativeKind,
  MediaDerivativeUpload,
  MediaPreparationJobCompletion,
  MediaPreparationJobPayload,
  MediaProbeArtifact,
  MediaRational,
} from "@anysub/contracts";
import type { PoolClient } from "pg";

import { withTransaction } from "$lib/server/db/transaction";
import { unprocessable } from "$lib/server/http-error";
import {
  ARTIFACT_LIMITS,
  stagingArtifactPath,
} from "$lib/server/media-artifact-staging";
import { resolveDataPath } from "$lib/server/media";
import { linkIdempotent } from "$lib/server/util";

const ARTIFACT_MEDIA_TYPES: Record<MediaDerivativeKind, readonly string[]> = {
  waveform: ["application/vnd.anysub.waveform+json"],
  thumbnail: ["image/jpeg"],
  proxy: ["video/mp4", "audio/mpeg"],
};
export function derivativeMediaType(
  kind: MediaDerivativeKind,
  stored: string,
): string {
  return (
    ARTIFACT_MEDIA_TYPES[kind].find((allowed) => allowed === stored) ??
    "application/octet-stream"
  );
}

const ARTIFACT_DIRECTORIES: Record<MediaDerivativeKind, string> = {
  waveform: "waveform",
  thumbnail: "thumbnails",
  proxy: "proxy",
};
const ARTIFACT_EXTENSIONS: Record<string, string> = {
  "application/vnd.anysub.waveform+json": ".json",
  "image/jpeg": ".jpg",
  "video/mp4": ".mp4",
  "audio/mpeg": ".mp3",
};

export type MediaFinalizationPlan = {
  createdPaths: string[];
  obsoletePaths: string[];
  stagingRoot: string;
};

export function isMediaDerivativeKind(
  value: string,
): value is MediaDerivativeKind {
  return value === "waveform" || value === "thumbnail" || value === "proxy";
}

export async function finalizeMediaPreparation(
  client: PoolClient,
  input: {
    jobId: string;
    attempt: number;
    workspaceId: string;
    payload: MediaPreparationJobPayload;
    completion: MediaPreparationJobCompletion;
  },
): Promise<MediaFinalizationPlan> {
  const { completion } = input;
  assertDerivativesAllowed(completion);
  const requiredKinds = requiredArtifactKinds(completion.probe);
  const artifacts = new Map<MediaDerivativeKind, MediaDerivativeUpload>();
  for (const artifact of completion.artifacts) {
    if (artifacts.has(artifact.kind)) {
      throw unprocessable(
        `Worker returned duplicate ${artifact.kind} derivatives.`,
      );
    }
    artifacts.set(artifact.kind, artifact);
  }
  for (const kind of requiredKinds) {
    if (!artifacts.has(kind)) {
      throw unprocessable(
        `Worker did not upload the required ${kind} derivative.`,
      );
    }
  }

  const project = await client.query<{
    media_original_key: string | null;
  }>("select media_original_key from projects where id = $1 for update", [
    input.payload.projectId,
  ]);
  if (project.rows[0]?.media_original_key !== input.payload.sourceStorageKey) {
    throw unprocessable(
      "Project source changed before media preparation completed.",
    );
  }

  const previous = await client.query<{
    kind: MediaDerivativeKind;
    storage_key: string;
  }>(`select kind, storage_key from media_derivatives where project_id = $1`, [
    input.payload.projectId,
  ]);
  const previousKeys = new Map(
    previous.rows.map((row) => [row.kind, row.storage_key]),
  );
  const createdPaths: string[] = [];
  const finalKeys = new Map<MediaDerivativeKind, string>();

  try {
    for (const artifact of artifacts.values()) {
      const stagedPath = stagingArtifactPath(
        {
          jobId: input.jobId,
          attempt: input.attempt,
          workspaceId: input.workspaceId,
          payload: input.payload,
          mediaType: null,
        },
        artifact.kind,
      );
      const stagedFile = await stat(stagedPath).catch(() => null);
      if (!stagedFile?.isFile() || stagedFile.size !== artifact.sizeBytes) {
        throw unprocessable(
          `Staged ${artifact.kind} derivative is incomplete.`,
        );
      }

      const storageKey = derivativeStorageKey(
        input.workspaceId,
        input.payload.projectId,
        input.jobId,
        artifact,
      );
      const destination = resolveDataPath(storageKey);
      await mkdir(dirname(destination), { recursive: true });
      if (await linkIdempotent(stagedPath, destination)) {
        createdPaths.push(destination);
      }
      finalKeys.set(artifact.kind, storageKey);
    }

    const frameRate = primaryFrameRate(completion.probe);
    await client.query(
      `update projects
          set media_duration_us = $2,
              media_preparation_status = 'completed',
              media_probe = $3,
              media_frame_rate_num = $4,
              media_frame_rate_den = $5,
              media_seekable = $6,
              media_proxy_recommended = $7,
              updated_at = now()
        where id = $1`,
      [
        input.payload.projectId,
        completion.probe.durationUs,
        JSON.stringify(completion.probe),
        frameRate?.numerator ?? null,
        frameRate?.denominator ?? null,
        completion.probe.seekable,
        completion.probe.proxyRecommended,
      ],
    );

    await client.query(
      `delete from media_derivatives
        where project_id = $1 and not (kind = any($2::text[]))`,
      [input.payload.projectId, [...artifacts.keys()]],
    );

    for (const artifact of artifacts.values()) {
      await client.query(
        `insert into media_derivatives
          (project_id, job_id, kind, status, storage_key, source_storage_key,
           media_type, size_bytes, schema_version, generator_version, metadata)
         values ($1, $2, $3, 'ready', $4, $5, $6, $7, $8, $9, $10)
         on conflict (project_id, kind) do update set
           job_id = excluded.job_id,
           status = 'ready',
           storage_key = excluded.storage_key,
           source_storage_key = excluded.source_storage_key,
           media_type = excluded.media_type,
           size_bytes = excluded.size_bytes,
           schema_version = excluded.schema_version,
           generator_version = excluded.generator_version,
           metadata = excluded.metadata,
           created_at = now(),
           updated_at = now()`,
        [
          input.payload.projectId,
          input.jobId,
          artifact.kind,
          finalKeys.get(artifact.kind),
          input.payload.sourceStorageKey,
          artifact.mediaType,
          artifact.sizeBytes,
          artifact.schemaVersion,
          artifact.generatorVersion,
          JSON.stringify({
            ...artifact.metadata,
            generator: completion.generator,
          }),
        ],
      );
    }
  } catch (cause) {
    await Promise.all(
      createdPaths.map((path) => unlink(path).catch(() => undefined)),
    );
    throw cause;
  }

  const obsoletePaths = [...previousKeys.entries()]
    .filter(([kind, key]) => finalKeys.get(kind) !== key)
    .map(([, key]) => resolveDataPath(key));
  return {
    createdPaths,
    obsoletePaths,
    stagingRoot: resolveDataPath(
      posix.join("staging", "worker-artifacts", input.jobId),
    ),
  };
}

export async function commitMediaFinalization(
  plan: MediaFinalizationPlan,
): Promise<void> {
  await Promise.all([
    ...plan.obsoletePaths.map((path) => unlink(path).catch(() => undefined)),
    rm(plan.stagingRoot, { recursive: true, force: true }),
  ]);
}

export async function rollbackMediaFinalization(
  plan: MediaFinalizationPlan,
): Promise<void> {
  await Promise.all(
    plan.createdPaths.map((path) => unlink(path).catch(() => undefined)),
  );
}

export async function deleteDerivativeForUser(
  projectId: string,
  kind: MediaDerivativeKind,
  userId: string,
): Promise<boolean> {
  const storageKey = await withTransaction(async (client) => {
    const derivative = await client.query<{ storage_key: string }>(
      `select derivative.storage_key
         from media_derivatives derivative
         join projects p on p.id = derivative.project_id
         join memberships m on m.workspace_id = p.workspace_id
        where derivative.project_id = $1 and derivative.kind = $2 and m.user_id = $3
        for update of derivative`,
      [projectId, kind, userId],
    );
    if (!derivative.rows[0]) return null;
    await client.query(
      `delete from media_derivatives where project_id = $1 and kind = $2`,
      [projectId, kind],
    );
    return derivative.rows[0].storage_key;
  });
  if (!storageKey) return false;
  await unlink(resolveDataPath(storageKey)).catch(() => undefined);
  return true;
}

function derivativeStorageKey(
  workspaceId: string,
  projectId: string,
  jobId: string,
  artifact: MediaDerivativeUpload,
): string {
  const extension = ARTIFACT_EXTENSIONS[artifact.mediaType];
  if (!extension)
    throw unprocessable(
      "Worker returned an unsupported derivative media type.",
    );
  return posix.join(
    "workspaces",
    workspaceId,
    "projects",
    projectId,
    "media",
    ARTIFACT_DIRECTORIES[artifact.kind],
    `${jobId}${extension}`,
  );
}

function assertDerivativesAllowed(
  completion: MediaPreparationJobCompletion,
): void {
  for (const artifact of completion.artifacts) {
    if (
      !ARTIFACT_MEDIA_TYPES[artifact.kind].includes(artifact.mediaType) ||
      artifact.sizeBytes > ARTIFACT_LIMITS[artifact.kind]
    ) {
      throw unprocessable("Worker returned an invalid derivative manifest.");
    }
  }
}

function requiredArtifactKinds(
  probe: MediaProbeArtifact,
): MediaDerivativeKind[] {
  const kinds: MediaDerivativeKind[] = [];
  if (probe.streams.some((stream) => stream.type === "audio"))
    kinds.push("waveform");
  if (
    probe.streams.some(
      (stream) => stream.type === "video" && !stream.video?.attachedPicture,
    )
  ) {
    kinds.push("thumbnail");
  }
  if (probe.proxyRecommended) kinds.push("proxy");
  return kinds;
}

function primaryFrameRate(probe: MediaProbeArtifact): MediaRational | null {
  for (const stream of probe.streams) {
    if (stream.type !== "video" || stream.video?.attachedPicture) continue;
    const frameRate = stream.video?.averageFrameRate ?? stream.video?.frameRate;
    if (frameRate) return frameRate;
  }
  return null;
}
