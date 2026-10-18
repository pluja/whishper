import { copyCues, type EditorCue } from "./cues";

const HISTORY_LIMIT = 50;
// Key repeat fires every few dozen milliseconds, so a held or quickly repeated
// nudge stays inside this window and becomes one undo step.
const COALESCE_WINDOW_MS = 1_000;

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
  // The undo step below the open edit session, compared by identity so a
  // trimmed stack cannot shift it. Undo inside the session stops there.
  #editFloor: EditorCue[] | undefined;
  #lastCoalesced: { key: string; at: number } | null = null;

  reset(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.#lastCoalesced = null;
    this.#editBaseline = null;
  }

  // Consecutive records sharing a coalesce key keep only the first snapshot.
  record(before: EditorCue[], coalesceKey?: string): void {
    const now = Date.now();
    const continues =
      coalesceKey !== undefined &&
      this.#lastCoalesced?.key === coalesceKey &&
      now - this.#lastCoalesced.at <= COALESCE_WINDOW_MS;
    this.#lastCoalesced =
      coalesceKey === undefined ? null : { key: coalesceKey, at: now };
    if (continues) return;
    this.undoStack = pushBounded(this.undoStack, before);
    this.redoStack = [];
  }

  beginEdit(current: readonly EditorCue[]): void {
    if (this.#editBaseline) return;
    this.#editBaseline = copyCues(current);
    this.#editFloor = this.undoStack.at(-1);
  }

  hasPendingEdit(current: readonly EditorCue[]): boolean {
    return (
      this.#editBaseline !== null &&
      JSON.stringify(this.#editBaseline) !== JSON.stringify(current)
    );
  }

  finishEdit(current: readonly EditorCue[]): void {
    if (!this.#editBaseline) return;
    if (JSON.stringify(this.#editBaseline) !== JSON.stringify(current)) {
      this.record(this.#editBaseline);
    }
    this.#editBaseline = null;
  }

  undo(current: readonly EditorCue[]): EditorCue[] | undefined {
    return this.#stepAcrossEdit(current, (floor) => {
      const previous = this.undoStack.at(-1);
      if (!previous || previous === floor) return undefined;
      this.redoStack = pushBounded(this.redoStack, copyCues(current));
      this.undoStack = this.undoStack.slice(0, -1);
      return previous;
    });
  }

  redo(current: readonly EditorCue[]): EditorCue[] | undefined {
    return this.#stepAcrossEdit(current, () => {
      const next = this.redoStack.at(-1);
      if (!next) return undefined;
      this.undoStack = pushBounded(this.undoStack, copyCues(current));
      this.redoStack = this.redoStack.slice(0, -1);
      return next;
    });
  }

  // Undo or redo while a field has focus first closes the changes made so far
  // as their own step, then continues the session from the restored cues.
  #stepAcrossEdit(
    current: readonly EditorCue[],
    step: (floor: EditorCue[] | undefined) => EditorCue[] | undefined,
  ): EditorCue[] | undefined {
    const editing = this.#editBaseline !== null;
    const floor = editing ? this.#editFloor : undefined;
    this.finishEdit(current);
    this.#lastCoalesced = null;
    const restored = step(floor);
    if (editing) {
      this.beginEdit(restored ?? current);
      this.#editFloor = floor;
    }
    return restored;
  }
}
