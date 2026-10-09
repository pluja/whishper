import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EditorCue } from "./cues";
import { CueEditor } from "./editor.svelte";

function cue(id: string, text: string): EditorCue {
  return { id, position: 0, start_us: 0, end_us: 1_000_000, text };
}

const trackA = { projectId: "project-a", trackId: "track-a" };
const trackB = { projectId: "project-b", trackId: "track-b" };

function newEditor(): CueEditor {
  return new CueEditor({
    cues: [],
    maxLineLength: () => 42,
    transport: {
      frameDurationUs: () => 40_000,
      preparedDurationUs: () => 0,
      trackDurationUs: () => 0,
    },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn(() => new Promise(() => {}));
  vi.stubGlobal("fetch", fetchMock);
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("CueEditor.loadTrack", () => {
  it("ignores reloads of the track already open", () => {
    const editor = newEditor();
    editor.loadTrack(trackA, [cue("a", "server")], 1);
    editor.setText(0, "edited");
    editor.loadTrack(trackA, [cue("a", "server")], 1);
    expect(editor.cues[0].text).toBe("edited");
    expect(editor.autosave.hasUnsavedChanges).toBe(true);
  });

  it("saves the previous track's edits to that track when switching", () => {
    const editor = newEditor();
    editor.loadTrack(trackA, [cue("a", "server")], 1);
    editor.setText(0, "edited");
    const previousAutosave = editor.autosave;

    editor.loadTrack(trackB, [cue("b", "other project")], 5);

    expect(editor.autosave).not.toBe(previousAutosave);
    expect(editor.autosave.track).toEqual(trackB);
    expect(editor.cues).toEqual([cue("b", "other project")]);
    expect(editor.selectedCueId).toBe("b");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/projects/project-a/tracks/track-a");
    expect(JSON.parse(init.body)).toMatchObject({
      revision: 1,
      cues: [{ id: "a", text: "edited" }],
    });
  });

  it("sorts out-of-order cues on load and saves the corrected order", () => {
    const editor = newEditor();
    const late = {
      ...cue("late", "second"),
      start_us: 2_000_000,
      end_us: 3_000_000,
    };
    const early = { ...cue("early", "first"), position: 1 };
    editor.loadTrack(trackA, [late, early], 1);

    expect(editor.cues.map((item) => [item.id, item.position])).toEqual([
      ["early", 0],
      ["late", 1],
    ]);
    expect(editor.selectedCueId).toBe("early");
    expect(editor.autosave.hasUnsavedChanges).toBe(true);
  });

  it("does not mark a track changed when its cues are already sorted", () => {
    const editor = newEditor();
    editor.loadTrack(trackA, [cue("a", "server")], 1);
    expect(editor.autosave.hasUnsavedChanges).toBe(false);
  });

  it("sorts cues recovered from the browser journal", () => {
    const editor = newEditor();
    const late = {
      ...cue("late", "second"),
      start_us: 2_000_000,
      end_us: 3_000_000,
    };
    const early = { ...cue("early", "first"), position: 1 };
    localStorage.setItem(
      "anysub:editor:project-a:track-a",
      JSON.stringify({ revision: 1, cues: [late, early] }),
    );
    editor.loadTrack(trackA, [cue("early", "server")], 1);
    expect(editor.cues.map((item) => item.id)).toEqual(["early", "late"]);
  });

  it("clears the editor when the new page has no track", () => {
    const editor = newEditor();
    editor.loadTrack(trackA, [cue("a", "server")], 1);
    editor.loadTrack(null, [], 0);
    expect(editor.cues).toEqual([]);
    expect(editor.autosave.track).toBeNull();
    expect(editor.history.undoStack).toEqual([]);
  });
});
