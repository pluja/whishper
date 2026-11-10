import { unlink } from "node:fs/promises";

import type { MediaDerivativeKind } from "@anysub/contracts";
import { and, eq } from "drizzle-orm";

import { db } from "$lib/server/db";
import { mediaDerivatives } from "$lib/server/db/schema";
import { withTransaction } from "$lib/server/db/transaction";
import { projectForUser } from "$lib/server/projects/access";
import { resolveDataPath } from "$lib/server/storage/paths";
import { GIB, MAX_UPLOAD_LIMIT_GIB } from "$lib/shared/instance-settings";

export const ARTIFACT_LIMITS: Record<MediaDerivativeKind, number> = {
  waveform: 64 * 1024 * 1024,
  thumbnail: 16 * 1024 * 1024,
  // A preview is never larger than the largest source an upload may be.
  proxy: MAX_UPLOAD_LIMIT_GIB * GIB,
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

export function readyDerivativeFile(
  projectId: string,
  kind: MediaDerivativeKind,
): { storageKey: string; mediaType: string } | null {
  const derivative = db
    .select({
      storageKey: mediaDerivatives.storageKey,
      mediaType: mediaDerivatives.mediaType,
    })
    .from(mediaDerivatives)
    .where(
      and(
        eq(mediaDerivatives.projectId, projectId),
        eq(mediaDerivatives.kind, kind),
        eq(mediaDerivatives.status, "ready"),
      ),
    )
    .get();
  return derivative ?? null;
}

export async function deleteDerivativeForUser(
  projectId: string,
  kind: MediaDerivativeKind,
  userId: string,
): Promise<boolean> {
  const storageKey = withTransaction((tx) => {
    if (!projectForUser(tx, projectId, userId)) return null;
    const derivative = tx
      .delete(mediaDerivatives)
      .where(
        and(
          eq(mediaDerivatives.projectId, projectId),
          eq(mediaDerivatives.kind, kind),
        ),
      )
      .returning({ storageKey: mediaDerivatives.storageKey })
      .get();
    return derivative?.storageKey ?? null;
  });
  if (!storageKey) return false;
  await unlink(resolveDataPath(storageKey)).catch(() => undefined);
  return true;
}
