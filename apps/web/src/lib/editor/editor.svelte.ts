import { Autosave, type TrackRef } from "./autosave.svelte";
import {
  copyCues,
  cueIssues,
  cueTimeError,
  deleteCue,
  insertCueAfter,
  mergeCueWithNext,
  nudgeCue,
  orderCuesByStart,
  retimeCue,
  splitCue,
  type CueEdit,
  type CueTimeField,
  type EditorCue,
} from "./cues";
import { CueHistory } from "./history.svelte";
import { Transport, type TransportOptions } from "./transport.svelte";
import type { TimingGesture } from "$lib/timeline/math";

function nudgeHistoryKey(cueId: string): string {
  return `nudge:${cueId}`;
}

export type CueTimeError = {
  cueId: string;
  field: CueTimeField;
  message: string;
};

type CueEditorOptions = {
  cues: EditorCue[];
  maxLineLength: () => number;
  readOnly?: () => boolean;
  transport: TransportOptions;
};

export class CueEditor {
  cues = $state<EditorCue[]>([]);
  selectedCueId = $state<string | null>(null);
  editing = $state(false);
  timeError = $state<CueTimeError | null>(null);
  autosave = $state.raw(new Autosave(null, 0, () => this.cues));
  readonly history = new CueHistory();
  readonly transport: Transport;
  readonly #options: CueEditorOptions;
  readonly #cursorPositions = new Map<string, number>();
  #editedCueId: string | null = null;
  #journalDeferred = false;

  selectedCueIndex = $derived(
    this.cues.findIndex((cue) => cue.id === this.selectedCueId),
  );
  hasSelection = $derived(this.selectedCueIndex >= 0);
  issues = $derived.by(() =>
    cueIssues(this.cues, this.#options.maxLineLength()),
  );
  issueCount = $derived(
    this.issues.reduce((count, issues) => count + issues.length, 0),
  );

  constructor(options: CueEditorOptions) {
    this.#options = options;
    this.cues = orderCuesByStart(options.cues).cues;
    this.selectedCueId = this.cues[0]?.id ?? null;
    this.transport = new Transport(this, options.transport);
  }

  get maxLineLength(): number {
    return this.#options.maxLineLength();
  }

  get readOnly(): boolean {
    return this.#options.readOnly?.() ?? false;
  }

  get canUndo(): boolean {
    return (
      !this.readOnly &&
      (this.history.undoStack.length > 0 ||
        (this.editing && this.history.hasPendingEdit(this.cues)))
    );
  }

  get canRedo(): boolean {
    return !this.readOnly && this.history.redoStack.length > 0;
  }

  loadTrack(track: TrackRef | null, cues: EditorCue[], revision: number): void {
    const outgoing = this.autosave;
    if (outgoing.track?.trackId === track?.trackId) return;
    const refusedEditsDiscarded =
      this.#refusedEditsStranded(track) && outgoing.discardEdits();
    outgoing.dispose();
    this.autosave = new Autosave(track, revision, () => this.cues);
    // The outgoing track's journal stays while its own pending save runs.
    const journalsDiscarded = this.autosave.discardOtherTrackJournals(
      outgoing.hasUnsavedChanges ? outgoing.track : null,
    );
    if (refusedEditsDiscarded || journalsDiscarded) {
      this.autosave.notice =
        "Unsaved edits to the previous transcript were discarded, because it was replaced.";
    }
    // Recovered edits would be stranded while a new transcription runs, so
    // they wait in the journal until editing resumes.
    this.#journalDeferred = this.readOnly;
    this.#showCues(
      (this.#journalDeferred ? null : this.autosave.recoverJournal()) ?? cues,
    );
  }

  // Edits the server refused during a transcription can never be saved once
  // another track of the same project replaces theirs.
  #refusedEditsStranded(incoming: TrackRef | null): boolean {
    const outgoing = this.autosave;
    return (
      incoming !== null &&
      outgoing.track?.projectId === incoming.projectId &&
      outgoing.blockedByTranscription
    );
  }

  // The lock lifted without a new track, so edits held back during the run
  // can reach this track again.
  resumeEditing(): void {
    if (this.readOnly) return;
    if (this.autosave.blockedByTranscription) void this.autosave.flush();
    if (!this.#journalDeferred) return;
    this.#journalDeferred = false;
    const recovered = this.autosave.recoverJournal();
    if (recovered) this.#showCues(recovered);
  }

  #showCues(cues: EditorCue[]): void {
    const ordered = orderCuesByStart(cues);
    this.cues = ordered.cues;
    this.selectedCueId = this.cues[0]?.id ?? null;
    this.#cursorPositions.clear();
    this.editing = false;
    this.#editedCueId = null;
    this.timeError = null;
    this.history.reset();
    if (ordered.changed) this.autosave.markChanged();
  }

  select(cueId: string): void {
    if (this.cues.some((cue) => cue.id === cueId)) this.selectedCueId = cueId;
  }

  beginEdit(cueId: string): void {
    this.editing = true;
    this.#editedCueId = cueId;
    this.history.beginEdit(this.cues);
  }

  finishEdit(): void {
    this.editing = false;
    this.#editedCueId = null;
    this.history.finishEdit(this.cues);
  }

  // A removed row takes its focused field with it, and Firefox and Safari
  // fire no blur then, so the session has to close here.
  #closeEditOfRemovedCue(cues: readonly EditorCue[]): void {
    const cueId = this.#editedCueId;
    if (cueId && !cues.some((cue) => cue.id === cueId)) this.finishEdit();
  }

  setText(index: number, text: string): void {
    if (this.readOnly) return;
    this.cues[index].text = text;
    this.cues = [...this.cues];
    this.#clearSettledTimeError(this.cues[index].id);
    this.autosave.markChanged();
  }

  setTime(index: number, field: CueTimeField, value: number): void {
    if (this.readOnly) return;
    const cueId = this.cues[index].id;
    this.cues = this.#retimeField(index, field, value).cues;
    this.#clearSettledTimeError(cueId);
    this.autosave.markChanged();
  }

  setTimeToPlayhead(index: number, field: CueTimeField): void {
    const cue = this.cues[index];
    if (!cue || this.readOnly) return;
    const sourceDurationUs = this.transport.sourceDurationUs;
    const playheadUs =
      sourceDurationUs > 0
        ? Math.min(this.transport.playbackUs, sourceDurationUs)
        : this.transport.playbackUs;
    const message = cueTimeError(cue, field, playheadUs);
    if (message) {
      this.showTimeError(cue.id, field, message);
      return;
    }
    if (cue[field] === playheadUs) return;
    this.#apply(this.#retimeField(index, field, playheadUs));
  }

  showTimeError(cueId: string, field: CueTimeField, message: string): void {
    this.timeError = { cueId, field, message };
  }

  clearTimeError(cueId: string, field: CueTimeField): void {
    if (this.timeError?.cueId === cueId && this.timeError.field === field) {
      this.timeError = null;
    }
  }

  #clearSettledTimeError(cueId: string): void {
    const cue = this.cues.find((item) => item.id === cueId);
    if (this.timeError?.cueId === cueId && cue && cue.end_us >= cue.start_us) {
      this.timeError = null;
    }
  }

  #retimeField(index: number, field: CueTimeField, value: number): CueEdit {
    const cue = this.cues[index];
    return retimeCue(this.cues, index, {
      start_us: cue.start_us,
      end_us: cue.end_us,
      [field]: value,
    });
  }

  rememberCursor(cueId: string, position: number): void {
    this.#cursorPositions.set(cueId, position);
  }

  #apply(edit: CueEdit, coalesceKey?: string): void {
    if (this.readOnly) return;
    this.#closeEditOfRemovedCue(edit.cues);
    this.history.record(copyCues(this.cues), coalesceKey);
    this.cues = edit.cues;
    this.timeError = null;
    if (edit.selectedCueId !== undefined) {
      this.selectedCueId = edit.selectedCueId;
    }
    this.autosave.markChanged();
  }

  splitSelected(): void {
    const index = this.selectedCueIndex;
    if (index < 0 || this.readOnly) return;
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
    const index = this.selectedCueIndex;
    if (index < 0) return;
    this.#apply(
      nudgeCue(this.cues, index, milliseconds),
      nudgeHistoryKey(this.cues[index].id),
    );
  }

  retime(
    timing: { id: string; start_us: number; end_us: number },
    gesture: TimingGesture = "drag",
  ): void {
    const index = this.cues.findIndex((cue) => cue.id === timing.id);
    if (index < 0) return;
    const cue = this.cues[index];
    const startUs = Math.round(timing.start_us);
    const endUs = Math.round(timing.end_us);
    if (cue.start_us === startUs && cue.end_us === endUs) return;
    this.#apply(
      retimeCue(this.cues, index, { start_us: startUs, end_us: endUs }),
      gesture === "nudge" ? nudgeHistoryKey(timing.id) : undefined,
    );
  }

  undo(): void {
    if (this.readOnly) return;
    this.#restore(this.history.undo(this.cues));
  }

  redo(): void {
    if (this.readOnly) return;
    this.#restore(this.history.redo(this.cues));
  }

  // When the selected cue no longer exists, the selection stays at its index
  // so the view keeps its place.
  #restore(snapshot: EditorCue[] | undefined): void {
    if (!snapshot) return;
    const selectedIndex = Math.max(0, this.selectedCueIndex);
    this.cues = snapshot;
    this.timeError = null;
    this.#closeEditOfRemovedCue(snapshot);
    if (!this.cues.some((cue) => cue.id === this.selectedCueId)) {
      this.selectedCueId =
        this.cues[Math.min(selectedIndex, this.cues.length - 1)]?.id ?? null;
    }
    this.autosave.markChanged();
  }
}
