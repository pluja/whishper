import { isAudioMedia } from "./media";

export const PROBE_STATES = [
  "not_started",
  "queued",
  "running",
  "completed",
  "failed",
] as const;
export type ProbeState = (typeof PROBE_STATES)[number];

export const UPLOAD_STATUSES = [
  "uploading",
  "finalizing",
  "completed",
  "cancelled",
  "failed",
] as const;
export type UploadStatus = (typeof UPLOAD_STATUSES)[number];
// The library shows an upload that stopped making progress as paused, so an
// abandoned upload does not keep the page polling.
export type LibraryUploadStatus = UploadStatus | "paused";

export const RUN_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
export const ACTIVE_RUN_STATUSES: readonly RunStatus[] = ["queued", "running"];

export const JOB_STATES = [
  "queued",
  "leased",
  "completed",
  "failed",
  "cancelled",
] as const;
export type JobState = (typeof JOB_STATES)[number];
export const ACTIVE_JOB_STATES: readonly JobState[] = ["queued", "leased"];

export type DisplayState =
  JobState | RunStatus | LibraryUploadStatus | "ready" | "draft" | "preparing";

type ProjectStatusFields = {
  runStatus: RunStatus | null;
  jobState: JobState | null;
  uploadStatus: LibraryUploadStatus | null;
  mediaPreparationStatus: ProbeState;
};

type ProjectMessageFields = {
  progressMessage: string | null;
  uploadStatus: LibraryUploadStatus | null;
  receivedBytes: number | null;
  sizeBytes: number | null;
};

const ACTIVE_UPLOAD_STATUSES: readonly LibraryUploadStatus[] = [
  "uploading",
  "finalizing",
];
const ACTIVE_PREPARATION_STATUSES: readonly ProbeState[] = [
  "queued",
  "running",
];

function isOneOf(values: readonly string[], value: string | null): boolean {
  return value !== null && values.includes(value);
}

export function isProjectActive(
  project: Pick<
    ProjectStatusFields,
    "jobState" | "uploadStatus" | "mediaPreparationStatus"
  >,
): boolean {
  return (
    isOneOf(ACTIVE_JOB_STATES, project.jobState) ||
    isOneOf(ACTIVE_UPLOAD_STATUSES, project.uploadStatus) ||
    ACTIVE_PREPARATION_STATUSES.includes(project.mediaPreparationStatus)
  );
}

export function isRunActive(run: { status: string } | null): boolean {
  return isOneOf(ACTIVE_RUN_STATUSES, run?.status ?? null);
}

export function isPreparationActive(
  preparation: { state: string } | null,
): boolean {
  return isOneOf(ACTIVE_JOB_STATES, preparation?.state ?? null);
}

export function isStudioActive(studio: {
  run: { status: string } | null;
  preparation: { state: string } | null;
}): boolean {
  return isRunActive(studio.run) || isPreparationActive(studio.preparation);
}

export function displayState(project: ProjectStatusFields): DisplayState {
  const processingState = project.jobState ?? project.runStatus;
  if (processingState) return processingState;
  if (ACTIVE_PREPARATION_STATUSES.includes(project.mediaPreparationStatus)) {
    return "preparing";
  }
  if (project.mediaPreparationStatus === "failed") return "failed";
  return project.uploadStatus === "completed"
    ? "ready"
    : (project.uploadStatus ?? "draft");
}

type UploadFields = Pick<
  ProjectMessageFields,
  "uploadStatus" | "receivedBytes" | "sizeBytes"
>;

function uploadedFraction(project: UploadFields): number | null {
  if (project.receivedBytes === null || !project.sizeBytes) return null;
  return project.receivedBytes / project.sizeBytes;
}

export function projectProgress(
  project: Omit<ProjectStatusFields, "runStatus"> &
    UploadFields & { progress: number | null },
): number | null {
  if (!isProjectActive(project)) return null;
  const uploaded =
    project.uploadStatus === "uploading" ? uploadedFraction(project) : null;
  return uploaded ?? project.progress ?? 0;
}

function projectMessage(project: ProjectMessageFields): string {
  if (project.progressMessage) return project.progressMessage;
  const { uploadStatus } = project;
  const uploaded = uploadedFraction(project);
  if (
    (uploadStatus === "uploading" || uploadStatus === "paused") &&
    uploaded !== null
  ) {
    return `${STATE_LABELS[uploadStatus]} · ${Math.round(uploaded * 100)}%`;
  }
  if (uploadStatus === "finalizing") return "Finalizing source media";
  if (uploadStatus === "completed") return "Source media stored";
  return "Project ready";
}

const STATE_LABELS: Record<DisplayState, string> = {
  ready: "Ready",
  draft: "Draft",
  queued: "Queued",
  leased: "Processing",
  running: "Processing",
  preparing: "Preparing",
  completed: "Complete",
  failed: "Needs attention",
  cancelled: "Cancelled",
  uploading: "Uploading",
  paused: "Upload paused",
  finalizing: "Finalizing",
};

export function stateLabel(state: DisplayState): string {
  return STATE_LABELS[state];
}

export type StatusTone = "neutral" | "accent" | "success" | "danger";

const IN_PROGRESS_STATES: readonly DisplayState[] = [
  ...ACTIVE_JOB_STATES,
  ...ACTIVE_RUN_STATUSES,
  ...ACTIVE_UPLOAD_STATUSES,
  "preparing",
];

export function statusTone(state: DisplayState): StatusTone {
  if (state === "ready" || state === "completed") return "success";
  if (state === "failed") return "danger";
  return IN_PROGRESS_STATES.includes(state) ? "accent" : "neutral";
}

export function projectSourceFallback(
  project: ProjectMessageFields & {
    mediaType: string | null;
    originalFilename: string | null;
  },
): string {
  const message = projectMessage(project);
  if (message !== "Project ready") return message;
  if (isAudioMedia(project.mediaType, project.originalFilename)) {
    return "Audio source";
  }
  if (project.mediaType?.startsWith("video/")) return "Video source";
  return "Media source";
}
