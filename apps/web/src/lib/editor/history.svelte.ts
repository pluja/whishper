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

// The undo and redo steps below an open session are compared by identity, so a
// trimmed stack cannot shift them. Undo and redo inside the session stop there.
type EditSession = {
  baseline: EditorCue[];
  cueId: string;
  cueSnapshot: string;
  undoFloor: EditorCue[] | undefined;
  redoFloor: EditorCue[] | undefined;
};

// Other edits close a session before they apply, so only the edited cue can
// differ from the baseline and comparing that cue is enough.
function cueSnapshot(cues: readonly EditorCue[], cueId: string): string {
  return JSON.stringify(cues.find((cue) => cue.id === cueId) ?? null);
}

export class CueHistory {
  undoStack = $state<EditorCue[][]>([]);
  redoStack = $state<EditorCue[][]>([]);
  #session: EditSession | null = null;
  #lastCoalesced: { key: string; at: number } | null = null;

  reset(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.#lastCoalesced = null;
    this.#session = null;
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

  beginEdit(current: readonly EditorCue[], cueId: string): void {
    if (this.#session) return;
    this.#session = {
      baseline: copyCues(current),
      cueId,
      cueSnapshot: cueSnapshot(current, cueId),
      undoFloor: this.undoStack.at(-1),
      redoFloor: this.redoStack.at(-1),
    };
  }

  hasPendingEdit(current: readonly EditorCue[]): boolean {
    const session = this.#session;
    return (
      session !== null &&
      cueSnapshot(current, session.cueId) !== session.cueSnapshot
    );
  }

  finishEdit(current: readonly EditorCue[]): void {
    const session = this.#session;
    if (!session) return;
    const changed = this.hasPendingEdit(current);
    this.#session = null;
    if (changed) this.record(session.baseline);
  }

  undo(current: readonly EditorCue[]): EditorCue[] | undefined {
    return this.#stepAcrossEdit(current, (session) => {
      const previous = this.undoStack.at(-1);
      if (!previous || previous === session?.undoFloor) return undefined;
      this.redoStack = pushBounded(this.redoStack, copyCues(current));
      this.undoStack = this.undoStack.slice(0, -1);
      return previous;
    });
  }

  redo(current: readonly EditorCue[]): EditorCue[] | undefined {
    return this.#stepAcrossEdit(current, (session) => {
      const next = this.redoStack.at(-1);
      if (!next || next === session?.redoFloor) return undefined;
      this.undoStack = pushBounded(this.undoStack, copyCues(current));
      this.redoStack = this.redoStack.slice(0, -1);
      return next;
    });
  }

  // Undo or redo while a field has focus first closes the changes made so far
  // as their own step, then continues the session from the restored cues.
  #stepAcrossEdit(
    current: readonly EditorCue[],
    step: (session: EditSession | null) => EditorCue[] | undefined,
  ): EditorCue[] | undefined {
    const session = this.#session;
    this.finishEdit(current);
    this.#lastCoalesced = null;
    const restored = step(session);
    if (session) {
      this.beginEdit(restored ?? current, session.cueId);
      this.#session = {
        ...this.#session!,
        undoFloor: session.undoFloor,
        redoFloor: session.redoFloor,
      };
    }
    return restored;
  }
}
