export type ProjectStatusFields = {
  run_status: string | null;
  job_state: string | null;
  upload_status: string | null;
  media_preparation_status: string;
};

export type ProjectMessageFields = {
  progress_message: string | null;
  upload_status: string | null;
  received_bytes: number | null;
  size_bytes: number | null;
};

const ACTIVE_JOB_STATES = ["queued", "leased"];
const ACTIVE_RUN_STATUSES = ["queued", "running"];
const ACTIVE_UPLOAD_STATUSES = ["uploading", "finalizing"];
const ACTIVE_PREPARATION_STATUSES = ["queued", "running"];

export function isProjectActive(
  project: Pick<
    ProjectStatusFields,
    "job_state" | "upload_status" | "media_preparation_status"
  >,
): boolean {
  return (
    (project.job_state !== null &&
      ACTIVE_JOB_STATES.includes(project.job_state)) ||
    (project.upload_status !== null &&
      ACTIVE_UPLOAD_STATUSES.includes(project.upload_status)) ||
    ACTIVE_PREPARATION_STATUSES.includes(project.media_preparation_status)
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
  const processingState = project.job_state ?? project.run_status;
  if (processingState) return processingState;
  if (ACTIVE_PREPARATION_STATUSES.includes(project.media_preparation_status)) {
    return "preparing";
  }
  if (project.media_preparation_status === "failed") return "failed";
  return project.upload_status === "completed"
    ? "ready"
    : (project.upload_status ?? "draft");
}

export function projectMessage(project: ProjectMessageFields): string {
  if (project.progress_message) return project.progress_message;
  if (
    project.upload_status === "uploading" &&
    project.received_bytes !== null &&
    project.size_bytes
  ) {
    const progress = Math.round(
      (project.received_bytes / project.size_bytes) * 100,
    );
    return `Uploading · ${progress}%`;
  }
  if (project.upload_status === "finalizing") return "Finalizing source media";
  if (project.upload_status === "completed") return "Source media stored";
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
  project: ProjectMessageFields & { media_type: string | null },
): string {
  const message = projectMessage(project);
  if (message !== "Project ready") return message;
  if (project.media_type?.startsWith("audio/")) return "Audio source";
  if (project.media_type?.startsWith("video/")) return "Video source";
  return "Media source";
}

export function mediaPlaceholder(project: { media_type: string | null }): {
  icon: string;
  label: string;
} {
  if (project.media_type?.startsWith("audio/")) {
    return { icon: "audio", label: "Audio project" };
  }
  if (project.media_type?.startsWith("video/")) {
    return { icon: "play", label: "Video project" };
  }
  return { icon: "file", label: "Media project" };
}
