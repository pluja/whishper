import { formatBytes } from "$lib/shared/format";
import { isAcceptedMediaType } from "$lib/shared/media";

export function selectedFileProblem(
  file: File,
  maxUploadBytes: number,
): string | null {
  if (!isAcceptedMediaType(file.type)) {
    return "This is not an audio or video file.";
  }
  if (file.size === 0) return "This file is empty.";
  if (file.size > maxUploadBytes) {
    return `This file is ${formatBytes(file.size)}, over the ${formatBytes(maxUploadBytes)} upload limit.`;
  }
  return null;
}
