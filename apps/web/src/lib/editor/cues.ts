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

export type CueEditFailure = { message: string };

const MIN_SPLIT_DURATION_US = 200_000;
const SPLIT_EDGE_MARGIN_US = 100_000;
const INSERTED_CUE_DURATION_US = 2_000_000;

export function cueIssues(
  cues: readonly EditorCue[],
  index: number,
  maxLineLength: number,
): string[] {
  const cue = cues[index];
  const issues: string[] = [];
  const duration = (cue.end_us - cue.start_us) / 1_000_000;
  const characters = cue.text.replace(/\s/g, "").length;
  if (!cue.text.trim()) issues.push("Empty cue");
  if (cue.text.length > maxLineLength)
    issues.push(`Over ${maxLineLength} characters`);
  if (duration <= 0) issues.push("No duration");
  else {
    if (duration < 0.5) issues.push("Under 0.5 seconds");
    if (duration > 7) issues.push("Over 7 seconds");
    if (characters / duration > 20) issues.push("Over 20 CPS");
  }
  if (index > 0 && cues[index - 1].end_us > cue.start_us)
    issues.push("Overlaps previous cue");
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

function copyCues(cues: readonly EditorCue[]): EditorCue[] {
  return cues.map((cue) => ({ ...cue }));
}

function renumber(cues: EditorCue[]): EditorCue[] {
  cues.forEach((cue, position) => (cue.position = position));
  return cues;
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
  return { cues: renumber(next) };
}

export function retimeCue(
  cues: readonly EditorCue[],
  index: number,
  timing: { start_us: number; end_us: number },
): CueEdit {
  const next = copyCues(cues);
  next[index].start_us = timing.start_us;
  next[index].end_us = timing.end_us;
  return { cues: renumber(next) };
}
