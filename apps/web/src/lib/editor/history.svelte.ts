import type { EditorCue } from "./cues";

const HISTORY_LIMIT = 50;

export function cueSnapshot(cues: readonly EditorCue[]): EditorCue[] {
  return cues.map((cue) => ({ ...cue }));
}

function pushBounded(
  stack: EditorCue[][],
  snapshot: EditorCue[],
): EditorCue[][] {
  return [...stack.slice(-(HISTORY_LIMIT - 1)), snapshot];
}

export class CueHistory {
  undoStack = $state<EditorCue[][]>([]);
  redoStack = $state<EditorCue[][]>([]);
  #editBaseline: EditorCue[] | null = null;

  reset(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  record(before: EditorCue[]): void {
    this.undoStack = pushBounded(this.undoStack, before);
    this.redoStack = [];
  }

  beginEdit(current: readonly EditorCue[]): void {
    this.#editBaseline ??= cueSnapshot(current);
  }

  finishEdit(current: readonly EditorCue[]): void {
    if (!this.#editBaseline) return;
    if (JSON.stringify(this.#editBaseline) !== JSON.stringify(current)) {
      this.record(this.#editBaseline);
    }
    this.#editBaseline = null;
  }

  undo(current: readonly EditorCue[]): EditorCue[] | undefined {
    const previous = this.undoStack.at(-1);
    if (!previous) return undefined;
    this.redoStack = pushBounded(this.redoStack, cueSnapshot(current));
    this.undoStack = this.undoStack.slice(0, -1);
    return previous;
  }

  redo(current: readonly EditorCue[]): EditorCue[] | undefined {
    const next = this.redoStack.at(-1);
    if (!next) return undefined;
    this.undoStack = pushBounded(this.undoStack, cueSnapshot(current));
    this.redoStack = this.redoStack.slice(0, -1);
    return next;
  }
}
