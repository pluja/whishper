import type { MediaDerivativeKind } from "@anysub/contracts";

export const TRACK_EXPORT_FORMATS = ["srt", "vtt", "txt", "json"] as const;
export type TrackExportFormat = (typeof TRACK_EXPORT_FORMATS)[number];

export function isTrackExportFormat(value: string): value is TrackExportFormat {
  return (TRACK_EXPORT_FORMATS as readonly string[]).includes(value);
}

export function projectPageUrl(projectId: string): string {
  return `/projects/${projectId}`;
}

function projectApiUrl(projectId: string): string {
  return `/api/projects/${projectId}`;
}

export function projectMediaUrl(projectId: string): string {
  return `${projectApiUrl(projectId)}/media`;
}

export function projectCaptionsUrl(projectId: string): string {
  return `${projectApiUrl(projectId)}/captions.vtt`;
}

export function projectDerivativeUrl(
  projectId: string,
  kind: MediaDerivativeKind,
): string {
  return `${projectApiUrl(projectId)}/derivatives/${kind}`;
}

export function trackUrl(projectId: string, trackId: string): string {
  return `${projectApiUrl(projectId)}/tracks/${trackId}`;
}

export function trackExportUrl(
  projectId: string,
  trackId: string,
  format: TrackExportFormat,
): string {
  return `${trackUrl(projectId, trackId)}/export/${format}`;
}
