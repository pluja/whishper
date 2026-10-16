import { unlink } from "node:fs/promises";

import type { MediaDerivativeKind } from "@anysub/contracts";

import { pool } from "$lib/server/db";
import { withTransaction } from "$lib/server/db/transaction";
import { privateEnv } from "$lib/server/env";
import { projectForUser } from "$lib/server/projects/access";
import { resolveDataPath } from "$lib/server/storage/paths";

export const ARTIFACT_LIMITS: Record<MediaDerivativeKind, number> = {
  waveform: 64 * 1024 * 1024,
  thumbnail: 16 * 1024 * 1024,
  proxy: privateEnv.maxUploadBytes,
};

export const ARTIFACT_MEDIA_TYPES: Record<
  MediaDerivativeKind,
  readonly string[]
> = {
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

export const ARTIFACT_DIRECTORIES: Record<MediaDerivativeKind, string> = {
  waveform: "waveform",
  thumbnail: "thumbnails",
  proxy: "proxy",
};

export const ARTIFACT_EXTENSIONS: Record<string, string> = {
  "application/vnd.anysub.waveform+json": ".json",
  "image/jpeg": ".jpg",
  "video/mp4": ".mp4",
  "audio/mpeg": ".mp3",
};

export function isMediaDerivativeKind(
  value: string,
): value is MediaDerivativeKind {
  return value === "waveform" || value === "thumbnail" || value === "proxy";
}

export async function readyDerivativeFile(
  projectId: string,
  kind: MediaDerivativeKind,
): Promise<{ storageKey: string; mediaType: string } | null> {
  const result = await pool.query<{ storageKey: string; mediaType: string }>(
    `select storage_key as "storageKey", media_type as "mediaType"
       from media_derivatives
      where project_id = $1 and kind = $2 and status = 'ready'`,
    [projectId, kind],
  );
  return result.rows[0] ?? null;
}

export async function deleteDerivativeForUser(
  projectId: string,
  kind: MediaDerivativeKind,
  userId: string,
): Promise<boolean> {
  const storageKey = await withTransaction(async (client) => {
    if (!(await projectForUser(client, projectId, userId))) return null;
    const derivative = await client.query<{ storage_key: string }>(
      `delete from media_derivatives
        where project_id = $1 and kind = $2
        returning storage_key`,
      [projectId, kind],
    );
    return derivative.rows[0]?.storage_key ?? null;
  });
  if (!storageKey) return false;
  await unlink(resolveDataPath(storageKey)).catch(() => undefined);
  return true;
}
