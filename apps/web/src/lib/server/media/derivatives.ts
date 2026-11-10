import { unlink } from "node:fs/promises";

import type { MediaDerivativeKind } from "@anysub/contracts";
import { and, eq } from "drizzle-orm";

import { db } from "$lib/server/db";
import { mediaDerivatives } from "$lib/server/db/schema";
import { withTransaction } from "$lib/server/db/transaction";
import { projectForUser } from "$lib/server/projects/access";
import { resolveDataPath } from "$lib/server/storage/paths";
import { GIB, MAX_UPLOAD_LIMIT_GIB } from "$lib/shared/instance-settings";

type DerivativeFormat = {
  directory: string;
  maxBytes: number;
  extensionByMediaType: Readonly<Record<string, string>>;
};

export const DERIVATIVE_FORMATS: Record<MediaDerivativeKind, DerivativeFormat> =
  {
    waveform: {
      directory: "waveform",
      maxBytes: 64 * 1024 * 1024,
      extensionByMediaType: { "application/vnd.anysub.waveform+json": ".json" },
    },
    thumbnail: {
      directory: "thumbnails",
      maxBytes: 16 * 1024 * 1024,
      extensionByMediaType: { "image/jpeg": ".jpg" },
    },
    proxy: {
      directory: "proxy",
      // A preview is never larger than the largest source an upload may be.
      maxBytes: MAX_UPLOAD_LIMIT_GIB * GIB,
      extensionByMediaType: { "video/mp4": ".mp4", "audio/mpeg": ".mp3" },
    },
  };

export function isMediaDerivativeKind(
  value: string,
): value is MediaDerivativeKind {
  return Object.hasOwn(DERIVATIVE_FORMATS, value);
}

export function derivativeExtension(
  kind: MediaDerivativeKind,
  mediaType: string,
): string | null {
  const { extensionByMediaType } = DERIVATIVE_FORMATS[kind];
  return Object.hasOwn(extensionByMediaType, mediaType)
    ? extensionByMediaType[mediaType]
    : null;
}

export function derivativeMediaType(
  kind: MediaDerivativeKind,
  stored: string,
): string {
  return derivativeExtension(kind, stored) === null
    ? "application/octet-stream"
    : stored;
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
