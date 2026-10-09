import { Autosave, type TrackRef } from "./autosave.svelte";
import {
  cueIssues,
  deleteCue,
  insertCueAfter,
  mergeCueWithNext,
  nudgeCue,
  retimeCue,
  splitCue,
  type CueEdit,
  type EditorCue,
} from "./cues";
import { CueHistory, cueSnapshot } from "./history.svelte";

type CueEditorOptions = {
  cues: EditorCue[];
  revision: number;
  track: () => TrackRef | null;
  maxLineLength: () => number;
  playbackUs: () => number;
  sourceDurationUs: () => number;
};

export class CueEditor {
  cues = $state<EditorCue[]>([]);
  selectedCueId = $state<string | null>(null);
  readonly history = new CueHistory();
  readonly autosave: Autosave;
  readonly #options: CueEditorOptions;
  readonly #cursorPositions = new Map<string, number>();

  selectedCueIndex = $derived(
    this.cues.findIndex((cue) => cue.id === this.selectedCueId),
  );
  issues = $derived(
    this.cues.map((_, index) =>
      cueIssues(this.cues, index, this.#options.maxLineLength()),
    ),
  );
  issueCount = $derived(
    this.issues.reduce((count, issues) => count + issues.length, 0),
  );

  constructor(options: CueEditorOptions) {
    this.#options = options;
    this.cues = options.cues;
    this.selectedCueId = this.cues[0]?.id ?? null;
    this.autosave = new Autosave(this, options.track);
    this.autosave.revision = options.revision;
  }

  get maxLineLength(): number {
    return this.#options.maxLineLength();
  }

  loadTrack(cues: EditorCue[], revision: number): void {
    this.cues = cues;
    this.autosave.revision = revision;
    this.selectedCueId = this.cues[0]?.id ?? null;
    this.autosave.state = "saved";
    this.history.reset();
    queueMicrotask(() => this.autosave.recoverJournal());
  }

  select(cueId: string): void {
    if (this.cues.some((cue) => cue.id === cueId)) this.selectedCueId = cueId;
  }

  beginEdit(): void {
    this.history.beginEdit(this.cues);
  }

  finishEdit(): void {
    this.history.finishEdit(this.cues);
  }

  setText(index: number, text: string): void {
    this.cues[index].text = text;
    this.cues = [...this.cues];
    this.autosave.markChanged();
  }

  setTime(index: number, field: "start_us" | "end_us", value: number): void {
    this.cues[index][field] = value;
    this.cues = [...this.cues];
    this.autosave.markChanged();
  }

  rememberCursor(cueId: string, position: number): void {
    this.#cursorPositions.set(cueId, position);
  }

  #apply(edit: CueEdit): void {
    this.history.record(cueSnapshot(this.cues));
    this.cues = edit.cues;
    if (edit.selectedCueId !== undefined) {
      this.selectedCueId = edit.selectedCueId;
    }
    this.autosave.markChanged();
  }

  splitSelected(): void {
    const index = this.selectedCueIndex;
    if (index < 0) return;
    const result = splitCue(this.cues, index, {
      playbackUs: this.#options.playbackUs(),
      cursorPosition: this.#cursorPositions.get(this.cues[index].id),
      newId: crypto.randomUUID(),
    });
    if ("message" in result) {
      this.autosave.message = result.message;
      return;
    }
    this.#apply(result);
  }

  mergeSelected(): void {
    const index = this.selectedCueIndex;
    if (index < 0 || index >= this.cues.length - 1) return;
    this.#apply(mergeCueWithNext(this.cues, index));
  }

  insertAfterSelected(): void {
    const index =
      this.selectedCueIndex < 0 ? this.cues.length - 1 : this.selectedCueIndex;
    this.#apply(
      insertCueAfter(this.cues, index, {
        sourceDurationUs: this.#options.sourceDurationUs(),
        newId: crypto.randomUUID(),
      }),
    );
  }

  deleteSelected(): void {
    if (this.selectedCueIndex < 0) return;
    this.#apply(deleteCue(this.cues, this.selectedCueIndex));
  }

  nudgeSelected(milliseconds: number): void {
    if (this.selectedCueIndex < 0) return;
    this.#apply(nudgeCue(this.cues, this.selectedCueIndex, milliseconds));
  }

  retime(timing: { id: string; start_us: number; end_us: number }): void {
    const index = this.cues.findIndex((cue) => cue.id === timing.id);
    if (index < 0) return;
    const cue = this.cues[index];
    const startUs = Math.round(timing.start_us);
    const endUs = Math.round(timing.end_us);
    if (cue.start_us === startUs && cue.end_us === endUs) return;
    this.#apply(
      retimeCue(this.cues, index, { start_us: startUs, end_us: endUs }),
    );
  }

  undo(): void {
    this.#restore(this.history.undo(this.cues));
  }

  redo(): void {
    this.#restore(this.history.redo(this.cues));
  }

  #restore(snapshot: EditorCue[] | undefined): void {
    if (!snapshot) return;
    this.cues = snapshot;
    if (!this.cues.some((cue) => cue.id === this.selectedCueId)) {
      this.selectedCueId = this.cues[0]?.id ?? null;
    }
    this.autosave.markChanged();
  }
}
