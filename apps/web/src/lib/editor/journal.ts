import type { EditorCue } from "./cues";

export type CueJournal = { revision: number; cues: EditorCue[] };

function isTime(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function journalCue(value: unknown, position: number): EditorCue | null {
  if (typeof value !== "object" || value === null) return null;
  const { id, start_us, end_us, text } = value as Record<string, unknown>;
  if (typeof id !== "string" || !id || typeof text !== "string") return null;
  if (!isTime(start_us) || !isTime(end_us) || end_us < start_us) return null;
  return { id, position, start_us, end_us, text };
}

export function parseCueJournal(serialized: string): CueJournal | null {
  let journal: unknown;
  try {
    journal = JSON.parse(serialized);
  } catch {
    return null;
  }
  if (typeof journal !== "object" || journal === null) return null;
  const { revision, cues } = journal as Record<string, unknown>;
  if (!Number.isSafeInteger(revision) || !Array.isArray(cues)) return null;
  const parsedCues = cues.map(journalCue);
  if (parsedCues.some((cue) => cue === null)) return null;
  return { revision: revision as number, cues: parsedCues as EditorCue[] };
}
