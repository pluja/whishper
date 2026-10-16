export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1024;
    unit += 1;
  } while (value >= 1024 && unit < units.length - 1);
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unit]}`;
}

export function formatClock(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const paddedSeconds = String(seconds).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${paddedSeconds}`
    : `${minutes}:${paddedSeconds}`;
}

export function formatDuration(microseconds: number): string {
  return formatClock(Math.round(microseconds / 1_000_000));
}

export function pluralize(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

export function formatDimensions(
  width: string | null,
  height: string | null,
): string | null {
  const numericWidth = Number(width);
  const numericHeight = Number(height);
  if (
    !Number.isInteger(numericWidth) ||
    !Number.isInteger(numericHeight) ||
    numericWidth <= 0 ||
    numericHeight <= 0
  ) {
    return null;
  }
  return `${numericWidth}×${numericHeight}`;
}

const languageNames = new Intl.DisplayNames(undefined, { type: "language" });

export function formatLanguages(languages: string[]): string {
  return languages
    .map((language) => {
      try {
        return languageNames.of(language) ?? language;
      } catch {
        return language;
      }
    })
    .join(", ");
}

export function formatSubtitleCounts(
  trackCount: number,
  cueCount: number,
): string {
  return `${pluralize(trackCount, "track")} · ${pluralize(cueCount, "cue")}`;
}
