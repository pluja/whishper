export type TrackExportFormat = "srt" | "vtt" | "json";

function projectApiUrl(projectId: string): string {
  return `/api/projects/${projectId}`;
}

export function projectMediaUrl(projectId: string): string {
  return `${projectApiUrl(projectId)}/media`;
}

export function projectCaptionsUrl(projectId: string): string {
  return `${projectApiUrl(projectId)}/captions.vtt`;
}

export function projectDerivativeUrl(projectId: string, kind: string): string {
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
