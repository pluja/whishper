import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat, unlink } from "node:fs/promises";
import { dirname, posix } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import type {
  MediaDerivativeKind,
  MediaDerivativeUpload,
  MediaPreparationJobCompletion,
  MediaPreparationJobPayload,
  MediaProbeArtifact,
  MediaRational,
} from "@anysub/contracts";
import type { PoolClient } from "pg";

import { pool } from "$lib/server/db";
import { withTransaction } from "$lib/server/db/transaction";
import { privateEnv } from "$lib/server/env";
import { resolveDataPath } from "$lib/server/media";
import { hashToken, linkIdempotent } from "$lib/server/util";

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
const ARTIFACT_LIMITS: Record<MediaDerivativeKind, number> = {
  waveform: 64 * 1024 * 1024,
  thumbnail: 16 * 1024 * 1024,
  proxy: privateEnv.maxUploadBytes,
};

export type MediaPreparationLease = {
  jobId: string;
  attempt: number;
  workspaceId: string;
  payload: MediaPreparationJobPayload;
  mediaType: string | null;
};

export type MediaFinalizationPlan = {
  createdPaths: string[];
  obsoletePaths: string[];
  stagingRoot: string;
};

export class ArtifactOffsetError extends Error {
  constructor(public readonly currentOffset: number) {
    super("Artifact upload offset does not match staged data.");
  }
}

export function isMediaDerivativeKind(
  value: string,
): value is MediaDerivativeKind {
  return value === "waveform" || value === "thumbnail" || value === "proxy";
}

export async function lockMediaPreparationProject(
  client: PoolClient,
  projectId: string,
): Promise<void> {
  await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
    projectId,
  ]);
}

export async function enqueueMediaPreparation(
  client: PoolClient,
  input: {
    workspaceId: string;
    projectId: string;
    sourceStorageKey: string;
    sourceFilename: string;
    sourceMediaType: string | null;
  },
): Promise<string> {
  await lockMediaPreparationProject(client, input.projectId);
  const project = await client.query<{ media_original_key: string | null }>(
    "select media_original_key from projects where id = $1 for update",
    [input.projectId],
  );
  if (
    !project.rows[0] ||
    project.rows[0].media_original_key !== input.sourceStorageKey
  ) {
    throw new Error("Project source changed before media preparation queued.");
  }
  const existing = await client.query<{ id: string }>(
    `select id
       from jobs
      where payload->>'kind' = 'media_prepare'
        and project_id = $1
        and state in ('queued', 'leased')
      order by created_at desc
      limit 1`,
    [input.projectId],
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const payload: MediaPreparationJobPayload = {
    kind: "media_prepare",
    projectId: input.projectId,
    sourceStorageKey: input.sourceStorageKey,
    sourceFilename: input.sourceFilename,
    ...(input.sourceMediaType
      ? { sourceMediaType: input.sourceMediaType }
      : {}),
  };
  const job = await client.query<{ id: string }>(
    `insert into jobs (workspace_id, project_id, kind, payload)
     values ($1, $2, 'media_prepare', $3)
     returning id`,
    [input.workspaceId, input.projectId, JSON.stringify(payload)],
  );
  await client.query(
    `update projects
        set media_preparation_status = 'queued', updated_at = now()
      where id = $1`,
    [input.projectId],
  );
  return job.rows[0].id;
}

export async function requestMediaPreparationForUser(
  projectId: string,
  userId: string,
): Promise<boolean> {
  return withTransaction(async (client) => {
    const project = await client.query<{
      workspace_id: string;
      media_original_key: string;
      media_filename: string;
      media_type: string | null;
    }>(
      `select p.workspace_id, p.media_original_key, p.media_filename,
              upload.media_type
         from projects p
         join memberships m on m.workspace_id = p.workspace_id
         left join media_uploads upload on upload.project_id = p.id
        where p.id = $1 and m.user_id = $2
          and p.media_original_key is not null
        `,
      [projectId, userId],
    );
    const row = project.rows[0];
    if (!row) return false;
    await enqueueMediaPreparation(client, {
      workspaceId: row.workspace_id,
      projectId,
      sourceStorageKey: row.media_original_key,
      sourceFilename: row.media_filename,
      sourceMediaType: row.media_type,
    });
    return true;
  });
}

export async function cancelMediaPreparationForUser(
  projectId: string,
  userId: string,
): Promise<boolean> {
  const jobId = await withTransaction(async (client) => {
    const active = await client.query<{ id: string; prepared: boolean }>(
      `select j.id, (p.media_probe is not null) as prepared
         from jobs j
         join projects p on p.id = j.project_id
         join memberships m on m.workspace_id = p.workspace_id
        where j.payload->>'kind' = 'media_prepare'
          and j.project_id = $1
          and j.state in ('queued', 'leased')
          and m.user_id = $2
        order by j.created_at desc
        limit 1
        for update of j, p`,
      [projectId, userId],
    );
    const job = active.rows[0];
    if (!job) return null;
    await client.query(
      `update jobs
          set state = 'cancelled', lease_token_hash = null,
              lease_expires_at = null, progress_message = 'Cancelled',
              updated_at = now()
        where id = $1`,
      [job.id],
    );
    await client.query(
      `update projects
          set media_preparation_status = $2, updated_at = now()
        where id = $1`,
      [projectId, job.prepared ? "completed" : "not_started"],
    );
    return job.id;
  });
  if (!jobId) return false;
  await cleanupStagedMediaArtifacts(jobId);
  return true;
}

export async function requireMediaPreparationLease(
  jobId: string,
  leaseToken: string,
): Promise<MediaPreparationLease> {
  const result = await pool.query<{
    attempts: number;
    workspace_id: string;
    payload: MediaPreparationJobPayload;
    media_type: string | null;
    media_original_key: string | null;
  }>(
    `select j.attempts, j.workspace_id, j.payload, upload.media_type,
            p.media_original_key
       from jobs j
       join projects p on p.id = j.project_id
       left join media_uploads upload on upload.project_id = p.id
      where j.id = $1
        and j.state = 'leased'
        and j.lease_token_hash = $2
        and j.lease_expires_at > now()
        and j.payload->>'kind' = 'media_prepare'`,
    [jobId, hashToken(leaseToken)],
  );
  const row = result.rows[0];
  if (
    !row ||
    row.payload.kind !== "media_prepare" ||
    row.media_original_key !== row.payload.sourceStorageKey
  ) {
    throw Object.assign(
      new Error("Media preparation lease is no longer active."),
      {
        statusCode: 409,
      },
    );
  }
  return {
    jobId,
    attempt: row.attempts,
    workspaceId: row.workspace_id,
    payload: row.payload,
    mediaType: row.media_type,
  };
}

export async function stagedArtifactOffset(
  lease: MediaPreparationLease,
  kind: MediaDerivativeKind,
): Promise<number> {
  const file = await stat(stagingArtifactPath(lease, kind)).catch(() => null);
  return file?.isFile() ? file.size : 0;
}

export async function appendArtifactChunk(
  lease: MediaPreparationLease,
  kind: MediaDerivativeKind,
  offset: number,
  uploadLength: number,
  contentLength: number,
  body: ReadableStream<Uint8Array>,
): Promise<number> {
  if (
    !Number.isSafeInteger(uploadLength) ||
    uploadLength <= 0 ||
    uploadLength > ARTIFACT_LIMITS[kind] ||
    !Number.isSafeInteger(contentLength) ||
    contentLength <= 0 ||
    contentLength > 32 * 1024 * 1024 ||
    offset < 0 ||
    offset + contentLength > uploadLength
  ) {
    throw Object.assign(new Error("Invalid artifact upload size."), {
      statusCode: 400,
    });
  }

  const path = stagingArtifactPath(lease, kind);
  await mkdir(dirname(path), { recursive: true });
  const currentOffset = await stagedArtifactOffset(lease, kind);
  if (currentOffset !== offset) throw new ArtifactOffsetError(currentOffset);

  await pipeline(
    Readable.fromWeb(body as never),
    createWriteStream(path, { flags: "a", mode: 0o600 }),
  );
  const nextOffset = await stagedArtifactOffset(lease, kind);
  if (
    nextOffset > uploadLength ||
    nextOffset - currentOffset !== contentLength
  ) {
    throw Object.assign(
      new Error("Artifact chunk length did not match its headers."),
      {
        statusCode: 400,
      },
    );
  }
  return nextOffset;
}

export async function openMediaPreparationSource(
  lease: MediaPreparationLease,
): Promise<{
  stream: ReadableStream<Uint8Array>;
  sizeBytes: number;
  mediaType: string;
}> {
  const path = resolveDataPath(lease.payload.sourceStorageKey);
  const file = await stat(path);
  if (!file.isFile()) {
    throw Object.assign(new Error("Source media was not found."), {
      statusCode: 404,
    });
  }
  return {
    stream: Readable.toWeb(
      createReadStream(path),
    ) as ReadableStream<Uint8Array>,
    sizeBytes: file.size,
    mediaType: lease.mediaType || "application/octet-stream",
  };
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
      throw new Error(
        `Worker returned duplicate ${artifact.kind} derivatives.`,
      );
    }
    artifacts.set(artifact.kind, artifact);
  }
  for (const kind of requiredKinds) {
    if (!artifacts.has(kind)) {
      throw new Error(`Worker did not upload the required ${kind} derivative.`);
    }
  }

  const project = await client.query<{
    media_original_key: string | null;
  }>("select media_original_key from projects where id = $1 for update", [
    input.payload.projectId,
  ]);
  if (project.rows[0]?.media_original_key !== input.payload.sourceStorageKey) {
    throw new Error(
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
        throw new Error(`Staged ${artifact.kind} derivative is incomplete.`);
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

export async function cleanupStagedMediaAttempt(
  jobId: string,
  attempt: number,
): Promise<void> {
  await rm(
    resolveDataPath(
      posix.join("staging", "worker-artifacts", jobId, String(attempt)),
    ),
    { recursive: true, force: true },
  ).catch(() => undefined);
}

export async function cleanupStagedMediaArtifacts(
  jobId: string,
): Promise<void> {
  await rm(resolveDataPath(posix.join("staging", "worker-artifacts", jobId)), {
    recursive: true,
    force: true,
  }).catch(() => undefined);
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

function stagingArtifactPath(
  lease: MediaPreparationLease,
  kind: MediaDerivativeKind,
): string {
  return resolveDataPath(
    posix.join(
      "staging",
      "worker-artifacts",
      lease.jobId,
      String(lease.attempt),
      `${kind}.part`,
    ),
  );
}

function derivativeStorageKey(
  workspaceId: string,
  projectId: string,
  jobId: string,
  artifact: MediaDerivativeUpload,
): string {
  const extension = ARTIFACT_EXTENSIONS[artifact.mediaType];
  if (!extension)
    throw new Error("Worker returned an unsupported derivative media type.");
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
      throw new Error("Worker returned an invalid derivative manifest.");
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
