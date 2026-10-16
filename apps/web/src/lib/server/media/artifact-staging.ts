import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat, truncate } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import type {
  MediaDerivativeKind,
  MediaPreparationJobPayload,
} from "@anysub/contracts";

import { pool } from "$lib/server/db";
import { isNodeError } from "$lib/server/guards";
import { badRequest, conflict, notFound } from "$lib/server/http/errors";
import { hashToken } from "$lib/server/jobs/lease-token";
import { IS_MEDIA_PREPARE_JOB } from "$lib/server/jobs/predicates";
import { ARTIFACT_LIMITS } from "$lib/server/media/derivatives";
import {
  resolveDataPath,
  workerArtifactsPath,
  workerAttemptPath,
} from "$lib/server/storage/paths";

const MAX_ARTIFACT_CHUNK_BYTES = 32 * 1024 * 1024;

const keyedLockTails = new Map<string, Promise<unknown>>();

export async function withKeyedLock<T>(
  key: string,
  work: () => Promise<T>,
): Promise<T> {
  const previous = keyedLockTails.get(key) ?? Promise.resolve();
  const run = previous.then(work, work);
  const tail = run.catch(() => undefined);
  keyedLockTails.set(key, tail);
  try {
    return await run;
  } finally {
    if (keyedLockTails.get(key) === tail) keyedLockTails.delete(key);
  }
}

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
        and ${IS_MEDIA_PREPARE_JOB}`,
    [jobId, hashToken(leaseToken)],
  );
  const row = result.rows[0];
  if (
    !row ||
    row.payload.kind !== "media_prepare" ||
    row.media_original_key !== row.payload.sourceStorageKey
  ) {
    throw conflict("Media preparation lease is no longer active.");
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
  const file = await stat(
    stagedArtifactPath(lease.jobId, lease.attempt, kind),
  ).catch(() => null);
  return file?.isFile() ? file.size : 0;
}

export function parseUploadInteger(header: string | null): number {
  return header !== null && /^\d+$/.test(header) ? Number(header) : Number.NaN;
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
    contentLength > MAX_ARTIFACT_CHUNK_BYTES ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset + contentLength > uploadLength
  ) {
    throw badRequest("Invalid artifact upload size.");
  }

  return withKeyedLock(`${lease.jobId}:${lease.attempt}`, async () => {
    const path = stagedArtifactPath(lease.jobId, lease.attempt, kind);
    await mkdir(dirname(path), { recursive: true });
    const currentOffset = await stagedArtifactOffset(lease, kind);
    if (currentOffset !== offset) throw new ArtifactOffsetError(currentOffset);

    try {
      await pipeline(
        Readable.fromWeb(body as never),
        capBytes(contentLength),
        createWriteStream(path, { flags: "a", mode: 0o600 }),
      );
      const nextOffset = await stagedArtifactOffset(lease, kind);
      if (nextOffset - currentOffset !== contentLength)
        throw chunkLengthError();
      return nextOffset;
    } catch (cause) {
      await truncate(path, currentOffset).catch(() => undefined);
      throw cause;
    }
  });
}

function chunkLengthError(): Error {
  return badRequest("Artifact chunk length did not match its headers.");
}

function capBytes(limit: number): Transform {
  let received = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      callback(received > limit ? chunkLengthError() : null, chunk);
    },
  });
}

export async function openMediaPreparationSource(
  lease: MediaPreparationLease,
): Promise<{
  stream: ReadableStream<Uint8Array>;
  sizeBytes: number;
  mediaType: string;
}> {
  const path = resolveDataPath(lease.payload.sourceStorageKey);
  const file = await stat(path).catch((cause: unknown) => {
    if (isNodeError(cause, "ENOENT")) return null;
    throw cause;
  });
  if (!file?.isFile()) {
    throw notFound("Source media was not found.");
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
  await rm(workerAttemptPath(jobId, attempt), {
    recursive: true,
    force: true,
  }).catch(() => undefined);
}

export async function cleanupStagedMediaArtifacts(
  jobId: string,
): Promise<void> {
  await rm(workerArtifactsPath(jobId), {
    recursive: true,
    force: true,
  }).catch(() => undefined);
}

export function stagedArtifactPath(
  jobId: string,
  attempt: number,
  kind: MediaDerivativeKind,
): string {
  return join(workerAttemptPath(jobId, attempt), `${kind}.part`);
}
