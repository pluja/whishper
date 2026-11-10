import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat, truncate } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import type {
  MediaDerivativeKind,
  MediaPreparationJobPayload,
} from "@anysub/contracts";

import { and, eq } from "drizzle-orm";

import { db } from "$lib/server/db";
import { jobs, mediaUploads, projects } from "$lib/server/db/schema";
import { isNodeError } from "$lib/server/guards";
import { badRequest, conflict, notFound } from "$lib/server/http/errors";
import {
  holdsActiveLease,
  isMediaPrepareJob,
} from "$lib/server/jobs/predicates";
import { ARTIFACT_LIMITS } from "$lib/server/media/derivatives";
import { withKeyedLock } from "$lib/server/storage/keyed-lock";
import {
  resolveDataPath,
  workerArtifactsPath,
  workerAttemptPath,
} from "$lib/server/storage/paths";

const MAX_ARTIFACT_CHUNK_BYTES = 32 * 1024 * 1024;

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

export function requireMediaPreparationLease(
  jobId: string,
  leaseToken: string,
): MediaPreparationLease {
  const row = db
    .select({
      attempts: jobs.attempts,
      workspaceId: jobs.workspaceId,
      payload: jobs.payload,
      mediaType: mediaUploads.mediaType,
      mediaOriginalKey: projects.mediaOriginalKey,
    })
    .from(jobs)
    .innerJoin(projects, eq(projects.id, jobs.projectId))
    .leftJoin(mediaUploads, eq(mediaUploads.projectId, projects.id))
    .where(
      and(eq(jobs.id, jobId), holdsActiveLease(leaseToken), isMediaPrepareJob),
    )
    .get();
  if (
    !row?.workspaceId ||
    row.payload.kind !== "media_prepare" ||
    row.mediaOriginalKey !== row.payload.sourceStorageKey
  ) {
    throw conflict("Media preparation lease is no longer active.");
  }
  return {
    jobId,
    attempt: row.attempts,
    workspaceId: row.workspaceId,
    payload: row.payload,
    mediaType: row.mediaType,
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
