import type { IconName } from "$lib/components/Icon.svelte";

export type ProjectStatusFields = {
  runStatus: string | null;
  jobState: string | null;
  uploadStatus: string | null;
  mediaPreparationStatus: string;
};

export type ProjectMessageFields = {
  progressMessage: string | null;
  uploadStatus: string | null;
  receivedBytes: number | null;
  sizeBytes: number | null;
};

const ACTIVE_JOB_STATES = ["queued", "leased"];
const ACTIVE_RUN_STATUSES = ["queued", "running"];
const ACTIVE_UPLOAD_STATUSES = ["uploading", "finalizing"];
const ACTIVE_PREPARATION_STATUSES = ["queued", "running"];

export function isProjectActive(
  project: Pick<
    ProjectStatusFields,
    "jobState" | "uploadStatus" | "mediaPreparationStatus"
  >,
): boolean {
  return (
    (project.jobState !== null &&
      ACTIVE_JOB_STATES.includes(project.jobState)) ||
    (project.uploadStatus !== null &&
      ACTIVE_UPLOAD_STATUSES.includes(project.uploadStatus)) ||
    ACTIVE_PREPARATION_STATUSES.includes(project.mediaPreparationStatus)
  );
}

export function isRunActive(run: { status: string } | null): boolean {
  return run !== null && ACTIVE_RUN_STATUSES.includes(run.status);
}

export function isPreparationActive(
  preparation: { state: string } | null,
): boolean {
  return preparation !== null && ACTIVE_JOB_STATES.includes(preparation.state);
}

export function isStudioActive(studio: {
  run: { status: string } | null;
  preparation: { state: string } | null;
}): boolean {
  return isRunActive(studio.run) || isPreparationActive(studio.preparation);
}

export function displayState(project: ProjectStatusFields): string {
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

function projectMessage(project: ProjectMessageFields): string {
  if (project.progressMessage) return project.progressMessage;
  if (
    project.uploadStatus === "uploading" &&
    project.receivedBytes !== null &&
    project.sizeBytes
  ) {
    const progress = Math.round(
      (project.receivedBytes / project.sizeBytes) * 100,
    );
    return `Uploading · ${progress}%`;
  }
  if (project.uploadStatus === "finalizing") return "Finalizing source media";
  if (project.uploadStatus === "completed") return "Source media stored";
  return "Project ready";
}

const STATE_LABELS: Record<string, string> = {
  ready: "Ready",
  draft: "Draft",
  queued: "Queued",
  leased: "Processing",
  running: "Processing",
  preparing: "Preparing",
  completed: "Complete",
  failed: "Needs attention",
  uploading: "Uploading",
  finalizing: "Finalizing",
};

export function stateLabel(state: string): string {
  return STATE_LABELS[state] ?? state;
}

export function projectSourceFallback(
  project: ProjectMessageFields & { mediaType: string | null },
): string {
  const message = projectMessage(project);
  if (message !== "Project ready") return message;
  if (project.mediaType?.startsWith("audio/")) return "Audio source";
  if (project.mediaType?.startsWith("video/")) return "Video source";
  return "Media source";
}

export function mediaPlaceholder(project: { mediaType: string | null }): {
  icon: IconName;
  label: string;
} {
  if (project.mediaType?.startsWith("audio/")) {
    return { icon: "audio", label: "Audio project" };
  }
  if (project.mediaType?.startsWith("video/")) {
    return { icon: "play", label: "Video project" };
  }
  return { icon: "file", label: "Media project" };
}
