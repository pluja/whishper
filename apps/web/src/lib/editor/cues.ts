export type EditorCue = {
  id: string;
  position: number;
  start_us: number;
  end_us: number;
  text: string;
};

export type CueEdit = {
  cues: EditorCue[];
  selectedCueId?: string | null; // undefined keeps the current selection
};

type CueEditFailure = { message: string };

const MIN_SPLIT_DURATION_US = 200_000;
const SPLIT_EDGE_MARGIN_US = 100_000;
const INSERTED_CUE_DURATION_US = 2_000_000;

// Expects cues sorted by start, which every timing edit preserves.
export function cueIssues(
  cues: readonly EditorCue[],
  maxLineLength: number,
): string[][] {
  let latestEndUs = -Infinity;
  return cues.map((cue, index) => {
    const issues = textAndTimingIssues(cue, maxLineLength);
    if (latestEndUs > cue.start_us) issues.push("Overlaps previous cue");
    const following = cues[index + 1];
    if (following && following.start_us < cue.end_us)
      issues.push("Overlaps next cue");
    latestEndUs = Math.max(latestEndUs, cue.end_us);
    return issues;
  });
}

export function charactersPerSecond(cue: EditorCue): number | null {
  const durationSeconds = (cue.end_us - cue.start_us) / 1_000_000;
  if (durationSeconds <= 0) return null;
  return cue.text.replace(/\s/g, "").length / durationSeconds;
}

export function cueTimeError(
  cue: EditorCue,
  field: "start_us" | "end_us",
  value: number,
): string | null {
  const startUs = field === "start_us" ? value : cue.start_us;
  const endUs = field === "end_us" ? value : cue.end_us;
  if (endUs >= startUs) return null;
  return field === "end_us"
    ? "Out must not be earlier than In."
    : "In must not be later than Out.";
}

function textAndTimingIssues(cue: EditorCue, maxLineLength: number): string[] {
  const issues: string[] = [];
  const duration = (cue.end_us - cue.start_us) / 1_000_000;
  if (!cue.text.trim()) issues.push("Empty cue");
  if (cue.text.length > maxLineLength)
    issues.push(`Over ${maxLineLength} characters`);
  if (duration <= 0) issues.push("No duration");
  else {
    if (duration < 0.5) issues.push("Under 0.5 seconds");
    if (duration > 7) issues.push("Over 7 seconds");
    if ((charactersPerSecond(cue) ?? 0) > 20) issues.push("Over 20 CPS");
  }
  return issues;
}

export function nearestWordBoundary(text: string, preferred: number): number {
  if (/\s/.test(text[preferred] ?? "")) return preferred;
  for (let distance = 1; distance < text.length; distance += 1) {
    if (/\s/.test(text[preferred - distance] ?? ""))
      return preferred - distance;
    if (/\s/.test(text[preferred + distance] ?? ""))
      return preferred + distance;
  }
  return -1;
}

export function copyCues(cues: readonly EditorCue[]): EditorCue[] {
  return cues.map((cue) => ({ ...cue }));
}

function renumber(cues: EditorCue[]): EditorCue[] {
  cues.forEach((cue, position) => (cue.position = position));
  return cues;
}

function sortByStart(cues: EditorCue[]): EditorCue[] {
  cues.sort(
    (first, second) =>
      first.start_us - second.start_us || first.end_us - second.end_us,
  );
  return renumber(cues);
}

// Older tracks and recovered journals may store cues in an order that no
// longer matches their timings.
export function orderCuesByStart(cues: readonly EditorCue[]): {
  cues: EditorCue[];
  changed: boolean;
} {
  const ordered = sortByStart(copyCues(cues));
  const changed = ordered.some(
    (cue, index) =>
      cue.id !== cues[index].id || cue.position !== cues[index].position,
  );
  return { cues: ordered, changed };
}

export function splitCue(
  cues: readonly EditorCue[],
  index: number,
  args: { playbackUs: number; cursorPosition?: number; newId: string },
): CueEdit | CueEditFailure {
  const cue = cues[index];
  if (cue.end_us - cue.start_us < MIN_SPLIT_DURATION_US) {
    return { message: "This cue is too short to split." };
  }
  const { playbackUs } = args;
  const splitUs =
    playbackUs > cue.start_us + SPLIT_EDGE_MARGIN_US &&
    playbackUs < cue.end_us - SPLIT_EDGE_MARGIN_US
      ? playbackUs
      : Math.round((cue.start_us + cue.end_us) / 2);
  const preferred =
    args.cursorPosition ??
    Math.round(
      cue.text.length *
        ((splitUs - cue.start_us) / (cue.end_us - cue.start_us)),
    );
  const textSplit = nearestWordBoundary(cue.text, preferred);
  if (textSplit <= 0 || textSplit >= cue.text.length) {
    return {
      message: "Place the text cursor between words before splitting.",
    };
  }
  const next = copyCues(cues);
  next[index] = {
    ...cue,
    end_us: splitUs,
    text: cue.text.slice(0, textSplit).trim(),
  };
  next.splice(index + 1, 0, {
    id: args.newId,
    position: index + 1,
    start_us: splitUs,
    end_us: cue.end_us,
    text: cue.text.slice(textSplit).trim(),
  });
  return { cues: renumber(next), selectedCueId: args.newId };
}

export function mergeCueWithNext(
  cues: readonly EditorCue[],
  index: number,
): CueEdit {
  const next = copyCues(cues);
  const cue = next[index];
  const following = next[index + 1];
  cue.end_us = Math.max(cue.end_us, following.end_us);
  cue.text = `${cue.text.trim()} ${following.text.trim()}`.trim();
  next.splice(index + 1, 1);
  return { cues: renumber(next) };
}

export function insertCueAfter(
  cues: readonly EditorCue[],
  index: number,
  args: { sourceDurationUs: number; newId: string },
): CueEdit {
  const previous = cues[index];
  const following = cues[index + 1];
  const start = previous?.end_us ?? 0;
  const availableEnd =
    following?.start_us ??
    (args.sourceDurationUs > start
      ? args.sourceDurationUs
      : start + INSERTED_CUE_DURATION_US);
  const end = Math.max(
    start,
    Math.min(start + INSERTED_CUE_DURATION_US, availableEnd),
  );
  const next = copyCues(cues);
  next.splice(index + 1, 0, {
    id: args.newId,
    position: index + 1,
    start_us: start,
    end_us: end,
    text: "",
  });
  return { cues: renumber(next), selectedCueId: args.newId };
}

export function deleteCue(cues: readonly EditorCue[], index: number): CueEdit {
  const next = copyCues(cues);
  next.splice(index, 1);
  return {
    cues: renumber(next),
    selectedCueId: next[Math.min(index, next.length - 1)]?.id ?? null,
  };
}

export function nudgeCue(
  cues: readonly EditorCue[],
  index: number,
  milliseconds: number,
): CueEdit {
  const next = copyCues(cues);
  const cue = next[index];
  const delta = milliseconds * 1_000;
  if (cue.start_us + delta < 0) {
    cue.end_us -= cue.start_us;
    cue.start_us = 0;
  } else {
    cue.start_us += delta;
    cue.end_us += delta;
  }
  return { cues: sortByStart(next) };
}

export function retimeCue(
  cues: readonly EditorCue[],
  index: number,
  timing: { start_us: number; end_us: number },
): CueEdit {
  const next = copyCues(cues);
  next[index].start_us = timing.start_us;
  next[index].end_us = timing.end_us;
  return { cues: sortByStart(next) };
}
