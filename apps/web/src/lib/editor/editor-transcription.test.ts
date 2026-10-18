import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cue,
  newEditor,
  restoreEditorGlobals,
  stubEditorGlobals,
  trackA,
  trackB,
} from "./testing";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = stubEditorGlobals();
});

afterEach(restoreEditorGlobals);

describe("CueEditor track replaced by a transcription", () => {
  const journalKeyA = "anysub:editor:project-a:track-a";
  const replacementTrack = { projectId: "project-a", trackId: "track-a2" };

  function storeJournal(text: string, revision = 1): void {
    localStorage.setItem(
      journalKeyA,
      JSON.stringify({ revision, cues: [cue("a", text)], updatedAt: 0 }),
    );
  }

  it("keeps the journal while locked and recovers it once unlocked", () => {
    let locked = true;
    const editor = newEditor(() => locked);
    storeJournal("journaled edit");

    editor.loadTrack(trackA, [cue("a", "server")], 1);
    editor.resumeEditing();
    expect(editor.cues[0].text).toBe("server");
    expect(localStorage.getItem(journalKeyA)).not.toBeNull();

    locked = false;
    editor.resumeEditing();
    expect(editor.cues[0].text).toBe("journaled edit");
    expect(editor.autosave.hasUnsavedChanges).toBe(true);
  });

  it("discards and reports a deferred journal when the new track loads", () => {
    let locked = true;
    const editor = newEditor(() => locked);
    storeJournal("journaled edit");
    editor.loadTrack(trackA, [cue("a", "server")], 1);

    locked = false;
    editor.loadTrack(replacementTrack, [cue("b", "new transcript")], 1);
    editor.resumeEditing();

    expect(editor.cues[0].text).toBe("new transcript");
    expect(localStorage.getItem(journalKeyA)).toBeNull();
    expect(editor.autosave.notice).toMatch(/discarded/);
  });

  it("reports nothing when the track loaded while locked had no edits", () => {
    let locked = true;
    const editor = newEditor(() => locked);
    editor.loadTrack(trackA, [cue("a", "server")], 1);

    locked = false;
    editor.loadTrack(replacementTrack, [cue("b", "new transcript")], 1);

    expect(editor.autosave.notice).toBeNull();
    expect(localStorage.getItem(journalKeyA)).toBeNull();
  });

  it("discards and reports edits the server refused during the run", async () => {
    let locked = false;
    const editor = newEditor(() => locked);
    fetchMock.mockResolvedValueOnce({
      status: 409,
      ok: false,
      json: async () => ({ code: "transcription_running", message: "Busy." }),
    });
    editor.loadTrack(trackA, [cue("a", "server")], 1);
    editor.setText(0, "refused edit");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(editor.autosave.blockedByTranscription).toBe(true);
    expect(localStorage.getItem(journalKeyA)).not.toBeNull();

    locked = true;
    editor.loadTrack(trackA, [cue("a", "server")], 1);
    locked = false;
    editor.loadTrack(replacementTrack, [cue("b", "new transcript")], 1);
    await vi.runAllTimersAsync();

    expect(editor.cues[0].text).toBe("new transcript");
    expect(editor.autosave.notice).toMatch(/discarded/);
    expect(localStorage.getItem(journalKeyA)).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("retries refused edits once the lock lifts without a new track", async () => {
    let locked = false;
    const editor = newEditor(() => locked);
    fetchMock.mockResolvedValueOnce({
      status: 409,
      ok: false,
      json: async () => ({ code: "transcription_running", message: "Busy." }),
    });
    editor.loadTrack(trackA, [cue("a", "server")], 1);
    editor.setText(0, "refused edit");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(editor.autosave.blockedByTranscription).toBe(true);

    locked = true;
    editor.resumeEditing();
    expect(fetchMock).toHaveBeenCalledOnce();

    fetchMock.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({ revision: 2 }),
    });
    locked = false;
    editor.resumeEditing();
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      revision: 1,
      cues: [{ text: "refused edit" }],
    });
    expect(editor.autosave.blockedByTranscription).toBe(false);
    expect(editor.autosave.state).toBe("saved");
    expect(editor.autosave.message).toBe("");
    expect(localStorage.getItem(journalKeyA)).toBeNull();
  });

  it("still saves pending edits when no transcription held them back", () => {
    const editor = newEditor();
    editor.loadTrack(trackA, [cue("a", "server")], 1);
    editor.setText(0, "edited");

    editor.loadTrack(replacementTrack, [cue("b", "new transcript")], 1);

    expect(editor.autosave.notice).toBeNull();
    expect(localStorage.getItem(journalKeyA)).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/projects/project-a/tracks/track-a",
    );
  });

  it("discards and reports another track's journal found on load", () => {
    storeJournal("edit left behind by the replaced track");
    const editor = newEditor();

    editor.loadTrack(replacementTrack, [cue("b", "new transcript")], 1);

    expect(editor.cues[0].text).toBe("new transcript");
    expect(localStorage.getItem(journalKeyA)).toBeNull();
    expect(editor.autosave.notice).toBe(
      "Unsaved edits to the previous transcript were discarded, because it was replaced.",
    );
  });

  it("reports nothing on load when no other track left a journal", () => {
    localStorage.setItem("anysub:theme", "dark");
    const editor = newEditor();

    editor.loadTrack(replacementTrack, [cue("b", "new transcript")], 1);

    expect(editor.autosave.notice).toBeNull();
    expect(localStorage.getItem("anysub:theme")).toBe("dark");
  });

  it("leaves the journals of other projects alone", () => {
    const otherProjectKey = "anysub:editor:project-b:track-b";
    localStorage.setItem(
      otherProjectKey,
      JSON.stringify({ revision: 1, cues: [cue("b", "x")], updatedAt: 0 }),
    );
    const editor = newEditor();

    editor.loadTrack(replacementTrack, [cue("b", "new transcript")], 1);

    expect(localStorage.getItem(otherProjectKey)).not.toBeNull();
    expect(editor.autosave.notice).toBeNull();
  });

  it("keeps the journal of the track being loaded", () => {
    storeJournal("journaled edit");
    const editor = newEditor();

    editor.loadTrack(trackA, [cue("a", "server")], 1);

    expect(editor.cues[0].text).toBe("journaled edit");
    expect(editor.autosave.notice).toBeNull();
  });

  it("keeps a locked track's journal when leaving for another project", () => {
    let locked = true;
    const editor = newEditor(() => locked);
    storeJournal("journaled edit");
    editor.loadTrack(trackA, [cue("a", "server")], 1);

    locked = false;
    editor.loadTrack(trackB, [cue("b", "other project")], 1);

    expect(editor.autosave.notice).toBeNull();
    expect(localStorage.getItem(journalKeyA)).not.toBeNull();
  });
});
