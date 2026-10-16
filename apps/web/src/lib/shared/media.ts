const AUDIO_FILENAME = /\.(mp3|wav|m4a|aac|flac|ogg|opus)$/i;

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
