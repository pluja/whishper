import type { IconName } from "#lib/components/icon-names.ts";
import type { ProjectSummary } from "#lib/shared/library-data.ts";
import { isAudioMedia } from "#lib/shared/media.ts";

export function mediaPlaceholder(
  project: Pick<ProjectSummary, "mediaType" | "originalFilename">,
): { icon: IconName; label: string } {
  if (isAudioMedia(project.mediaType, project.originalFilename)) {
    return { icon: "audio", label: "Audio project" };
  }
  if (project.mediaType?.startsWith("video/")) {
    return { icon: "play", label: "Video project" };
  }
  return { icon: "file", label: "Media project" };
}
