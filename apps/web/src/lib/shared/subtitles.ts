export type SubtitleTrack = {
  id: string;
  name: string;
  language: string;
  metadata: Record<string, unknown>;
  revision: number;
};

export type SubtitleCueSnapshot = {
  id: string;
  position: number;
  startUs: number;
  endUs: number;
  text: string;
  words?: Record<string, unknown>[];
};

export function formatEditorTime(microseconds: number): string {
  return formatSubtitleTime(microseconds, ".");
}

// Accepts plain seconds ("62.5") as well as MM:SS and HH:MM:SS forms, so
// times pasted from other tools parse without retyping.
export function parseEditorTime(value: string): number | null {
  const match = value
    .trim()
    .match(/^(?:(?:(\d+):)?(\d{1,2}):)?(\d+)(?:[.,](\d{1,3}))?$/);
  if (!match) return null;
  const [, hoursPart, minutesPart, secondsPart, fractionPart] = match;
  const hours = Number(hoursPart ?? 0);
  const minutes = Number(minutesPart ?? 0);
  const seconds = Number(secondsPart);
  const milliseconds = Number((fractionPart ?? "0").padEnd(3, "0"));
  if (minutes > 59) return null;
  if (minutesPart !== undefined && (secondsPart.length !== 2 || seconds > 59)) {
    return null;
  }
  return (
    ((hours * 3_600 + minutes * 60 + seconds) * 1_000 + milliseconds) * 1_000
  );
}

export function renderSrt(cues: SubtitleCueSnapshot[]): string {
  return `${cues
    .map(
      (cue, index) =>
        `${index + 1}\n${formatSubtitleTime(cue.startUs, ",")} --> ${formatSubtitleTime(cue.endUs, ",")}\n${normalizeCueText(cue.text).replaceAll("-->", "->")}`,
    )
    .join("\n\n")}\n`;
}

export function renderWebVtt(cues: SubtitleCueSnapshot[]): string {
  return `WEBVTT\n\n${cues
    .map(
      (cue) =>
        `${formatSubtitleTime(cue.startUs, ".")} --> ${formatSubtitleTime(cue.endUs, ".")}\n${escapeWebVttText(normalizeCueText(cue.text))}`,
    )
    .join("\n\n")}\n`;
}

// Cue line breaks only exist for subtitle wrapping, so a transcript reads as
// one line per cue.
export function renderPlainText(cues: SubtitleCueSnapshot[]): string {
  const lines = cues
    .map((cue) => normalizeCueText(cue.text).replace(/\s*\n\s*/g, " "))
    .filter(Boolean);
  return lines.length ? `${lines.join("\n")}\n` : "";
}

function formatSubtitleTime(
  microseconds: number,
  separator: "." | ",",
): string {
  const milliseconds = Math.max(0, Math.floor(microseconds / 1_000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1_000);
  const remainder = milliseconds % 1_000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${separator}${String(remainder).padStart(3, "0")}`;
}

function normalizeCueText(value: string): string {
  return value
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replace(/\n[ \t]*(?:\n[ \t]*)+/g, "\n")
    .trim();
}

function escapeWebVttText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
