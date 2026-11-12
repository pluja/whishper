import { stat, statfs } from "node:fs/promises";

import { count, eq, inArray, sql } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

import type { Executor } from "#lib/server/db/index.ts";
import { mediaDerivatives, mediaUploads } from "#lib/server/db/schema.ts";
import { privateEnv } from "#lib/server/env.ts";
import type { StorageUsage, StoredFiles } from "#lib/shared/storage-usage.ts";

const DATABASE_SIDE_FILES = ["", "-wal", "-shm"];
const NO_FILES: StoredFiles = { bytes: 0, count: 0 };

export async function storageUsage(executor: Executor): Promise<StorageUsage> {
  const originals = executor
    .select(filesTotal(mediaUploads.sizeBytes))
    .from(mediaUploads)
    .where(eq(mediaUploads.status, "completed"))
    .get();
  const uploading = executor
    .select(filesTotal(mediaUploads.receivedBytes))
    .from(mediaUploads)
    .where(inArray(mediaUploads.status, ["uploading", "finalizing"]))
    .get();
  const previews = executor
    .select(filesTotal(mediaDerivatives.sizeBytes))
    .from(mediaDerivatives)
    .where(eq(mediaDerivatives.status, "ready"))
    .get();
  const [volume, databaseBytes] = await Promise.all([
    volumeSpace(privateEnv.dataRoot),
    databaseSize(privateEnv.databaseFile),
  ]);
  return {
    volume,
    originals: originals ?? NO_FILES,
    previews: previews ?? NO_FILES,
    uploading: uploading ?? NO_FILES,
    databaseBytes,
  };
}

function filesTotal(size: SQLiteColumn) {
  return {
    bytes: sql<number>`coalesce(sum(${size}), 0)`,
    count: count(),
  };
}

async function volumeSpace(path: string): Promise<StorageUsage["volume"]> {
  try {
    const space = await statfs(path);
    const totalBytes = space.blocks * space.bsize;
    if (totalBytes <= 0) return null;
    return {
      totalBytes,
      availableBytes: Math.min(space.bavail * space.bsize, totalBytes),
    };
  } catch {
    return null;
  }
}

async function databaseSize(file: string): Promise<number> {
  const sizes = await Promise.all(
    DATABASE_SIDE_FILES.map((suffix) =>
      stat(`${file}${suffix}`).then(
        (info) => info.size,
        () => 0,
      ),
    ),
  );
  return sizes.reduce((total, size) => total + size, 0);
}
