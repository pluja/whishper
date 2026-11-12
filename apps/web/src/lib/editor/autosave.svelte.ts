import { copyCues, type EditorCue } from "./cues";
import { parseCueJournal } from "./journal";
import {
  readStorage,
  removeStorage,
  storageKeys,
  writeStorage,
} from "#lib/browser/safe-storage.ts";
import { trackUrl } from "#lib/shared/routes.ts";

type SaveState = "saved" | "unsaved" | "saving" | "error" | "conflict";

export type TrackRef = { projectId: string; trackId: string };

type Timer = ReturnType<typeof setTimeout>;

const SAVE_DEBOUNCE_MS = 800;
const RECOVERED_SAVE_DELAY_MS = 1_200;
const JOURNAL_DEBOUNCE_MS = 120;
const KEEPALIVE_BODY_LIMIT_BYTES = 64 * 1024;
const JOURNAL_PREFIX = "anysub:editor:";

const SAVE_LABELS: Record<SaveState, string> = {
  saving: "Saving…",
  unsaved: "Unsaved changes",
  error: "Save failed",
  conflict: "Editing conflict",
  saved: "Saved",
};

function journalKey({ projectId, trackId }: TrackRef): string {
  return `${JOURNAL_PREFIX}${projectId}:${trackId}`;
}

function responseMessage(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const { message } = body as { message?: unknown };
  return typeof message === "string" && message ? message : null;
}

function isTranscriptionRunning(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    (body as { code?: unknown }).code === "transcription_running"
  );
}

export class Autosave {
  state = $state<SaveState>("saved");
  message = $state("");
  // Unlike message, typing does not clear it, so a discard stays visible.
  notice = $state<string | null>(null);
  // The server refused the save because a new transcription is running.
  blockedByTranscription = $state(false);
  readonly track: TrackRef | null;
  #revision: number;
  #cues: () => readonly EditorCue[];
  #changeVersion = 0;
  #savedVersion = 0;
  #saveTimer: Timer | undefined;
  #journalTimer: Timer | undefined;
  #pendingSave: Promise<void> | null = null;
  #leaving = false;

  constructor(
    track: TrackRef | null,
    revision: number,
    cues: () => readonly EditorCue[],
  ) {
    this.track = track;
    this.#revision = revision;
    this.#cues = cues;
  }

  get label(): string {
    return SAVE_LABELS[this.state];
  }

  get hasUnsavedChanges(): boolean {
    return this.#changeVersion !== this.#savedVersion;
  }

  get #journalKey(): string {
    return this.track ? journalKey(this.track) : "";
  }

  markChanged(): void {
    this.#changeVersion += 1;
    this.#scheduleJournal();
    if (this.state === "conflict") return;
    this.state = this.#pendingSave ? "saving" : "unsaved";
    this.message = "";
    this.#scheduleSave(SAVE_DEBOUNCE_MS);
  }

  flush(): Promise<void> {
    this.#clearSaveTimer();
    this.#pendingSave ??= this.#saveWhileUnsaved().finally(() => {
      this.#pendingSave = null;
    });
    return this.#pendingSave;
  }

  // One PUT at a time: each request carries the revision returned by the
  // previous one, so overlapping requests would conflict with each other.
  async #saveWhileUnsaved(): Promise<void> {
    while (this.track && this.hasUnsavedChanges && this.state !== "conflict") {
      const version = this.#changeVersion;
      this.state = "saving";
      if (!(await this.#put(this.track))) return;
      this.#savedVersion = version;
      if (!this.hasUnsavedChanges) {
        this.state = "saved";
        this.#clearJournal();
        return;
      }
      this.state = "unsaved";
      this.#persistJournal();
      if (this.#saveTimer !== undefined) return;
    }
  }

  async #put(track: TrackRef): Promise<boolean> {
    try {
      const body = JSON.stringify({
        revision: this.#revision,
        cues: this.#cues().map((cue) => ({
          id: cue.id,
          startUs: cue.start_us,
          endUs: cue.end_us,
          text: cue.text,
        })),
      });
      const response = await fetch(trackUrl(track.projectId, track.trackId), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body,
        // keepalive lets the request outlive an unloading page, but browsers
        // reject keepalive bodies above 64 KiB.
        keepalive:
          this.#leaving &&
          new TextEncoder().encode(body).length <= KEEPALIVE_BODY_LIMIT_BYTES,
      });
      const result: unknown = await response.json().catch(() => null);
      if (response.status === 409 && isTranscriptionRunning(result)) {
        this.state = "error";
        this.message =
          responseMessage(result) ?? "A new transcription is running.";
        this.blockedByTranscription = true;
        this.#persistJournal();
        return false;
      }
      if (response.status === 409) {
        this.state = "conflict";
        this.message =
          "This track changed elsewhere. Reload before continuing.";
        return false;
      }
      if (!response.ok) {
        throw new Error(
          responseMessage(result) ?? `Save failed (HTTP ${response.status}).`,
        );
      }
      const revision = (result as { revision?: unknown } | null)?.revision;
      if (!Number.isSafeInteger(revision)) {
        throw new Error("Save failed: the server sent an unexpected response.");
      }
      this.#revision = revision as number;
      this.blockedByTranscription = false;
      this.message = "";
      return true;
    } catch (cause) {
      this.state = "error";
      this.message = cause instanceof Error ? cause.message : "Save failed.";
      this.#persistJournal();
      return false;
    }
  }

  // Returns whether there were edits to discard.
  discardEdits(): boolean {
    const hadEdits = this.hasUnsavedChanges || this.#readJournal() !== null;
    this.#savedVersion = this.#changeVersion;
    this.#clearSaveTimer();
    this.#clearJournal();
    return hadEdits;
  }

  recoverJournal(): EditorCue[] | null {
    const serialized = this.#readJournal();
    if (!serialized) return null;
    const journal = parseCueJournal(serialized);
    if (!journal) {
      this.#clearJournal();
      return null;
    }
    // Edits made against an older revision cannot be replayed without
    // overwriting the newer server copy, so they are dropped, but visibly.
    if (journal.revision !== this.#revision) {
      this.#clearJournal();
      this.notice =
        "Unsaved edits from an older version of this track were found in this browser and discarded, because the track has changed since.";
      return null;
    }
    this.#changeVersion += 1;
    this.state = "unsaved";
    this.message = "Recovered unsaved changes from this browser.";
    this.#scheduleSave(RECOVERED_SAVE_DELAY_MS);
    return journal.cues;
  }

  // Only the latest track of a project is editable, so no editor will ever
  // recover the journal of another track. Returns whether any were removed.
  discardOtherTrackJournals(pendingSave: TrackRef | null): boolean {
    if (!this.track) return false;
    const projectPrefix = `${JOURNAL_PREFIX}${this.track.projectId}:`;
    const kept = [this.#journalKey, pendingSave ? journalKey(pendingSave) : ""];
    const orphaned = storageKeys().filter(
      (key) => key.startsWith(projectPrefix) && !kept.includes(key),
    );
    orphaned.forEach(removeStorage);
    return orphaned.length > 0;
  }

  dismissNotice(): void {
    this.notice = null;
  }

  // Returns false when unsaved edits cannot reach the server, so leaving
  // would strand them in the browser journal.
  leave(): boolean {
    if (!this.hasUnsavedChanges) return true;
    this.#persistJournal();
    if (this.state === "conflict" || this.state === "error") return false;
    this.#leaving = true;
    // The unload can still be cancelled, so only this flush has to outlive
    // the page.
    void this.flush().finally(() => {
      this.#leaving = false;
    });
    return true;
  }

  dispose(): void {
    const finalCues = copyCues(this.#cues());
    this.#cues = () => finalCues;
    this.leave();
    this.#clearSaveTimer();
  }

  #persistJournal(): void {
    clearTimeout(this.#journalTimer);
    const journalKey = this.#journalKey;
    if (!journalKey || !this.hasUnsavedChanges) return;
    const journal = JSON.stringify({
      revision: this.#revision,
      cues: this.#cues(),
      updatedAt: Date.now(),
    });
    if (!writeStorage(journalKey, journal)) {
      this.message =
        "Browser recovery storage is unavailable. Server autosave is still active.";
    }
  }

  #readJournal(): string | null {
    return this.#journalKey ? readStorage(this.#journalKey) : null;
  }

  #clearJournal(): void {
    clearTimeout(this.#journalTimer);
    if (this.#journalKey) removeStorage(this.#journalKey);
  }

  #scheduleJournal(): void {
    clearTimeout(this.#journalTimer);
    this.#journalTimer = setTimeout(
      () => this.#persistJournal(),
      JOURNAL_DEBOUNCE_MS,
    );
  }

  #scheduleSave(delayMs: number): void {
    this.#clearSaveTimer();
    this.#saveTimer = setTimeout(() => void this.flush(), delayMs);
  }

  #clearSaveTimer(): void {
    clearTimeout(this.#saveTimer);
    this.#saveTimer = undefined;
  }
}
