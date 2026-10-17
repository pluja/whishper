const AUDIO_FILENAME = /\.(mp3|wav|m4a|aac|flac|ogg|opus)$/i;
const MEDIA_TYPE_PATTERN =
  /^(?:(?:audio|video)\/[a-z0-9][a-z0-9!#$&^_.+-]*|application\/(?:ogg|mp4))$/;

// Uploads may arrive without a media type, so the filename is the fallback.
export function isAudioMedia(
  mediaType: string | null,
  filename: string | null,
): boolean {
  return (
    mediaType?.startsWith("audio/") === true ||
    AUDIO_FILENAME.test(filename ?? "")
  );
}

export function normalizeMediaType(value: string | null | undefined) {
  const essence = value?.split(";")[0].trim().toLowerCase();
  return essence && MEDIA_TYPE_PATTERN.test(essence) ? essence : null;
}

// Browsers leave the type empty for unknown extensions, and the upload server accepts an empty type.
export function isAcceptedMediaType(type: string): boolean {
  return type.trim() === "" || normalizeMediaType(type) !== null;
}
