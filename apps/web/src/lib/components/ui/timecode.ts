import { clamp } from "$lib/shared/clamp";
import { formatEditorTime, parseEditorTime } from "$lib/shared/subtitles";

export type TimecodeEdit = { text: string; caret: number };

// The mask is HH:MM:SS.mmm, so the field holds a fixed number of characters.
const TIMECODE_LENGTH = 12;
const DIGIT_POSITIONS = [0, 1, 3, 4, 6, 7, 9, 10, 11];
const SIXTY_TENS_POSITIONS = new Set([3, 6]);
const MILLISECOND_US = 1_000;
const SEGMENTS = [
  { end: 2, unitUs: 3_600_000_000 },
  { end: 5, unitUs: 60_000_000 },
  { end: 8, unitUs: 1_000_000 },
  { end: 12, unitUs: MILLISECOND_US },
];

export const TIMECODE_MAX_US = ((99 * 60 + 59) * 60 + 59) * 1_000_000 + 999_000;

export function formatTimecode(microseconds: number): string {
  return formatEditorTime(Math.min(microseconds, TIMECODE_MAX_US));
}

function nextDigitPosition(position: number): number {
  return DIGIT_POSITIONS.find((digit) => digit >= position) ?? TIMECODE_LENGTH;
}

function previousDigitPosition(position: number): number | undefined {
  return DIGIT_POSITIONS.findLast((digit) => digit < position);
}

function replaceAt(text: string, position: number, digit: string): string {
  return `${text.slice(0, position)}${digit}${text.slice(position + 1)}`;
}

function zeroDigits(text: string, start: number, end: number): string {
  return DIGIT_POSITIONS.filter(
    (position) => position >= start && position < end,
  ).reduce((result, position) => replaceAt(result, position, "0"), text);
}

export function overtype(
  text: string,
  selectionStart: number,
  typed: string,
): TimecodeEdit | null {
  let result = text;
  let caret = selectionStart;
  let changed = false;
  for (const character of typed) {
    if (!/^\d$/.test(character)) continue;
    const position = nextDigitPosition(caret);
    if (position >= TIMECODE_LENGTH) break;
    if (SIXTY_TENS_POSITIONS.has(position) && character > "5") continue;
    result = replaceAt(result, position, character);
    caret = nextDigitPosition(position + 1);
    changed = true;
  }
  return changed ? { text: result, caret } : null;
}

export function eraseBackward(
  text: string,
  selectionStart: number,
  selectionEnd: number,
): TimecodeEdit {
  if (selectionStart !== selectionEnd) {
    return {
      text: zeroDigits(text, selectionStart, selectionEnd),
      caret: selectionStart,
    };
  }
  const position = previousDigitPosition(selectionStart);
  if (position === undefined) return { text, caret: selectionStart };
  return { text: replaceAt(text, position, "0"), caret: position };
}

export function eraseForward(
  text: string,
  selectionStart: number,
  selectionEnd: number,
): TimecodeEdit {
  if (selectionStart !== selectionEnd) {
    return eraseBackward(text, selectionStart, selectionEnd);
  }
  const position = nextDigitPosition(selectionStart);
  if (position >= TIMECODE_LENGTH) return { text, caret: selectionStart };
  return {
    text: replaceAt(text, position, "0"),
    caret: nextDigitPosition(position + 1),
  };
}

// A caret touching a segment from either side steps that segment. A known
// source duration caps the result, unless the time already lies past it.
export function stepTimecode(
  microseconds: number,
  caret: number,
  direction: 1 | -1,
  large: boolean,
  sourceDurationUs = 0,
): number {
  const segment = SEGMENTS.find(({ end }) => caret <= end) ?? SEGMENTS[3];
  const wholeMilliseconds =
    Math.floor(microseconds / MILLISECOND_US) * MILLISECOND_US;
  const stepped =
    wholeMilliseconds + direction * segment.unitUs * (large ? 10 : 1);
  const limit =
    sourceDurationUs > 0
      ? Math.min(TIMECODE_MAX_US, Math.max(sourceDurationUs, wholeMilliseconds))
      : TIMECODE_MAX_US;
  return clamp(stepped, 0, limit);
}

export function parsePastedTimecode(value: string): number | null {
  const microseconds = parseEditorTime(value);
  return microseconds !== null && microseconds <= TIMECODE_MAX_US
    ? microseconds
    : null;
}
