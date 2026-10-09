import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { dirname, posix } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import type {
  MediaDerivativeKind,
  MediaPreparationJobPayload,
} from "@anysub/contracts";

import { pool } from "$lib/server/db";
import { privateEnv } from "$lib/server/env";
import { resolveDataPath } from "$lib/server/media";
import { hashToken } from "$lib/server/util";

export const ARTIFACT_LIMITS: Record<MediaDerivativeKind, number> = {
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

export class ArtifactOffsetError extends Error {
  constructor(public readonly currentOffset: number) {
    super("Artifact upload offset does not match staged data.");
  }
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

export function stagingArtifactPath(
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
