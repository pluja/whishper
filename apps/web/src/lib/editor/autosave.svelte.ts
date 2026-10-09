import type { EditorCue } from "./cues";
import { cueSnapshot } from "./history.svelte";

export type SaveState = "saved" | "unsaved" | "saving" | "error" | "conflict";

export type TrackRef = { projectId: string; trackId: string };

type CueSource = { cues: EditorCue[] };

const SAVE_DEBOUNCE_MS = 800;
const RESAVE_DELAY_MS = 50;
const RECOVERED_SAVE_DELAY_MS = 1_200;
const JOURNAL_DEBOUNCE_MS = 120;

const SAVE_LABELS: Record<SaveState, string> = {
  saving: "Saving…",
  unsaved: "Unsaved changes",
  error: "Save failed",
  conflict: "Editing conflict",
  saved: "Saved",
};

export class Autosave {
  state = $state<SaveState>("saved");
  message = $state("");
  revision = $state(0);
  #source: CueSource;
  #track: () => TrackRef | null;
  #changeVersion = 0;
  #saveTimer: number | undefined;
  #journalTimer: number | undefined;
  #saveAgain = false;

  constructor(source: CueSource, track: () => TrackRef | null) {
    this.#source = source;
    this.#track = track;
  }

  get label(): string {
    return SAVE_LABELS[this.state];
  }

  get #journalKey(): string {
    const track = this.#track();
    return track ? `anysub:editor:${track.projectId}:${track.trackId}` : "";
  }

  markChanged(): void {
    this.#changeVersion += 1;
    this.state = "unsaved";
    this.message = "";
    this.#scheduleJournal();
    if (this.#saveTimer) window.clearTimeout(this.#saveTimer);
    this.#saveTimer = window.setTimeout(
      () => void this.flush(),
      SAVE_DEBOUNCE_MS,
    );
  }

  async flush(): Promise<void> {
    const track = this.#track();
    if (!track || this.state === "conflict") return;
    if (this.state === "saving") {
      this.#saveAgain = true;
      return;
    }
    if (this.state === "saved") return;
    if (this.#saveTimer) window.clearTimeout(this.#saveTimer);
    const savedChangeVersion = this.#changeVersion;
    this.state = "saving";
    try {
      const response = await fetch(
        `/api/projects/${track.projectId}/tracks/${track.trackId}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            revision: this.revision,
            cues: this.#source.cues.map((cue) => ({
              id: cue.id,
              startUs: cue.start_us,
              endUs: cue.end_us,
              text: cue.text,
            })),
          }),
        },
      );
      const result = await response.json();
      if (response.status === 409) {
        this.state = "conflict";
        this.message =
          "This track changed elsewhere. Reload before continuing.";
        return;
      }
      if (!response.ok) throw new Error(result.message ?? "Save failed.");
      this.revision = Number(result.revision);
      if (savedChangeVersion === this.#changeVersion && !this.#saveAgain) {
        this.state = "saved";
        window.localStorage.removeItem(this.#journalKey);
      } else {
        this.#saveAgain = false;
        this.state = "unsaved";
        this.#persistJournal();
        this.#saveTimer = window.setTimeout(
          () => void this.flush(),
          RESAVE_DELAY_MS,
        );
      }
    } catch (cause) {
      this.state = "error";
      this.message = cause instanceof Error ? cause.message : "Save failed.";
      this.#persistJournal();
    }
  }

  #persistJournal(): void {
    const journalKey = this.#journalKey;
    if (!journalKey) return;
    try {
      window.localStorage.setItem(
        journalKey,
        JSON.stringify({
          revision: this.revision,
          cues: cueSnapshot(this.#source.cues),
          updatedAt: Date.now(),
        }),
      );
    } catch {
      this.message =
        "Browser recovery storage is full. Server autosave is still active.";
    }
  }

  #scheduleJournal(): void {
    if (this.#journalTimer) window.clearTimeout(this.#journalTimer);
    this.#journalTimer = window.setTimeout(
      () => this.#persistJournal(),
      JOURNAL_DEBOUNCE_MS,
    );
  }

  recoverJournal(): void {
    const journalKey = this.#journalKey;
    if (!journalKey) return;
    try {
      const value = window.localStorage.getItem(journalKey);
      if (!value) return;
      const journal = JSON.parse(value);
      if (journal.revision !== this.revision || !Array.isArray(journal.cues))
        return;
      this.#source.cues = journal.cues;
      this.state = "unsaved";
      this.message = "Recovered unsaved changes from this browser.";
      this.#changeVersion += 1;
      this.#saveTimer = window.setTimeout(
        () => void this.flush(),
        RECOVERED_SAVE_DELAY_MS,
      );
    } catch {
      window.localStorage.removeItem(journalKey);
    }
  }

  guardUnload(): () => void {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (this.state === "saved") return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      if (this.#saveTimer) window.clearTimeout(this.#saveTimer);
      if (this.#journalTimer) window.clearTimeout(this.#journalTimer);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }
}
