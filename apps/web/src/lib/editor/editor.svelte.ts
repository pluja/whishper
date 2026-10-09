import { Autosave, type TrackRef } from "./autosave.svelte";
import {
  copyCues,
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
import { CueHistory } from "./history.svelte";
import { Transport, type TransportOptions } from "./transport.svelte";

type CueEditorOptions = {
  cues: EditorCue[];
  maxLineLength: () => number;
  transport: TransportOptions;
};

export class CueEditor {
  cues = $state<EditorCue[]>([]);
  selectedCueId = $state<string | null>(null);
  autosave = $state.raw(new Autosave(null, 0, () => this.cues));
  readonly history = new CueHistory();
  readonly transport: Transport;
  readonly #options: CueEditorOptions;
  readonly #cursorPositions = new Map<string, number>();

  selectedCueIndex = $derived(
    this.cues.findIndex((cue) => cue.id === this.selectedCueId),
  );
  issues = $derived.by(() =>
    cueIssues(this.cues, this.#options.maxLineLength()),
  );
  issueCount = $derived(
    this.issues.reduce((count, issues) => count + issues.length, 0),
  );

  constructor(options: CueEditorOptions) {
    this.#options = options;
    this.cues = options.cues;
    this.selectedCueId = this.cues[0]?.id ?? null;
    this.transport = new Transport(this, options.transport);
  }

  get maxLineLength(): number {
    return this.#options.maxLineLength();
  }

  loadTrack(track: TrackRef | null, cues: EditorCue[], revision: number): void {
    if (this.autosave.track?.trackId === track?.trackId) return;
    this.autosave.dispose();
    this.autosave = new Autosave(track, revision, () => this.cues);
    this.cues = this.autosave.recoverJournal() ?? cues;
    this.selectedCueId = this.cues[0]?.id ?? null;
    this.#cursorPositions.clear();
    this.history.reset();
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
    const cue = this.cues[index];
    this.cues = retimeCue(this.cues, index, {
      start_us: cue.start_us,
      end_us: cue.end_us,
      [field]: value,
    }).cues;
    this.autosave.markChanged();
  }

  rememberCursor(cueId: string, position: number): void {
    this.#cursorPositions.set(cueId, position);
  }

  #apply(edit: CueEdit): void {
    this.history.record(copyCues(this.cues));
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
      playbackUs: this.transport.playbackUs,
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
        sourceDurationUs: this.transport.sourceDurationUs,
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
