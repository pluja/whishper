import type { MediaDerivativeKind } from "@anysub/contracts";

import { privateEnv } from "$lib/server/env";

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
