import { isAcceptedMediaType } from "$lib/shared/media";

export function firstDroppedMediaFile(
  dataTransfer: DataTransfer | null,
): File | null {
  const files = Array.from(dataTransfer?.files ?? []);
  return files.find((file) => isAcceptedMediaType(file.type)) ?? null;
}
