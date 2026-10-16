import { mkdir, rm, stat, unlink } from "node:fs/promises";
import { dirname } from "node:path";

import type {
  MediaDerivativeKind,
  MediaDerivativeUpload,
  MediaPreparationJobCompletion,
  MediaPreparationJobPayload,
} from "@anysub/contracts";
import type { PoolClient } from "pg";

import { withTransaction } from "$lib/server/db/transaction";
import { unprocessable } from "$lib/server/http/errors";
import {
  ARTIFACT_DIRECTORIES,
  ARTIFACT_EXTENSIONS,
  ARTIFACT_LIMITS,
  ARTIFACT_MEDIA_TYPES,
} from "$lib/server/media/derivatives";
import { stagedArtifactPath } from "$lib/server/media/artifact-staging";
import {
  primaryFrameRate,
  requiredArtifactKinds,
} from "$lib/server/media/probe";
import { linkIdempotent } from "$lib/server/storage/files";
import {
  derivativeStorageKey,
  resolveDataPath,
  workerArtifactsPath,
} from "$lib/server/storage/paths";

export type MediaFinalizationPlan = {
  createdPaths: string[];
  obsoletePaths: string[];
  stagingRoot: string;
};

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
      const stagedPath = stagedArtifactPath(
        input.jobId,
        input.attempt,
        artifact.kind,
      );
      const stagedFile = await stat(stagedPath).catch(() => null);
      if (!stagedFile?.isFile() || stagedFile.size !== artifact.sizeBytes) {
        throw unprocessable(
          `Staged ${artifact.kind} derivative is incomplete.`,
        );
      }

      const storageKey = artifactStorageKey(
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
    stagingRoot: workerArtifactsPath(input.jobId),
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

function artifactStorageKey(
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
  return derivativeStorageKey(
    workspaceId,
    projectId,
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
