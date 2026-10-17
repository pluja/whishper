import { isAcceptedMediaType } from "$lib/shared/media";

// During a drag the browser hides the files themselves; only item kinds and types are readable.
export function carriesMediaFile(dataTransfer: DataTransfer | null): boolean {
  return Array.from(dataTransfer?.items ?? []).some(
    (item) => item.kind === "file" && isAcceptedMediaType(item.type),
  );
}

export function firstDroppedMediaFile(
  dataTransfer: DataTransfer | null,
): File | null {
  const files = Array.from(dataTransfer?.files ?? []);
  return files.find((file) => isAcceptedMediaType(file.type)) ?? null;
}
