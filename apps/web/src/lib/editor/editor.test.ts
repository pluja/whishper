import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EditorCue } from "./cues";
import { CueEditor } from "./editor.svelte";

function cue(id: string, text: string): EditorCue {
  return { id, position: 0, start_us: 0, end_us: 1_000_000, text };
}

const trackA = { projectId: "project-a", trackId: "track-a" };
const trackB = { projectId: "project-b", trackId: "track-b" };

function newEditor(readOnly = () => false): CueEditor {
  return new CueEditor({
    cues: [],
    maxLineLength: () => 42,
    readOnly,
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

describe("CueEditor nudge history", () => {
  function timedCue(id: string, startSeconds: number): EditorCue {
    return {
      id,
      position: 0,
      start_us: startSeconds * 1_000_000,
      end_us: (startSeconds + 1) * 1_000_000,
      text: id,
    };
  }

  function editorWithTwoCues(): CueEditor {
    const editor = newEditor();
    editor.loadTrack(trackA, [timedCue("a", 1), timedCue("b", 5)], 1);
    return editor;
  }

  function nudgeTiming(editor: CueEditor, id: string, deltaUs: number) {
    const target = editor.cues.find((item) => item.id === id)!;
    editor.retime(
      {
        id,
        start_us: target.start_us + deltaUs,
        end_us: target.end_us + deltaUs,
      },
      "nudge",
    );
  }

  it("coalesces a held arrow key on one cue into a single undo step", () => {
    const editor = editorWithTwoCues();
    for (let step = 0; step < 60; step += 1) {
      nudgeTiming(editor, "a", 1_000);
      vi.advanceTimersByTime(30);
    }

    expect(editor.cues[0].start_us).toBe(1_060_000);
    expect(editor.history.undoStack).toHaveLength(1);
    editor.undo();
    expect(editor.cues[0].start_us).toBe(1_000_000);
  });

  it("coalesces repeated toolbar nudges of the selected cue", () => {
    const editor = editorWithTwoCues();
    editor.nudgeSelected(100);
    editor.nudgeSelected(100);
    editor.nudgeSelected(100);

    expect(editor.history.undoStack).toHaveLength(1);
  });

  it("starts a new undo step for another cue, after a pause or after a drag", () => {
    const editor = editorWithTwoCues();
    nudgeTiming(editor, "a", 1_000);
    nudgeTiming(editor, "b", 1_000);
    expect(editor.history.undoStack).toHaveLength(2);

    vi.advanceTimersByTime(1_500);
    nudgeTiming(editor, "b", 1_000);
    expect(editor.history.undoStack).toHaveLength(3);

    editor.retime({ id: "b", start_us: 6_000_000, end_us: 7_000_000 });
    nudgeTiming(editor, "b", 1_000);
    expect(editor.history.undoStack).toHaveLength(5);
  });

  it("does not fold a nudge into the step before an undo", () => {
    const editor = editorWithTwoCues();
    nudgeTiming(editor, "a", 1_000);
    editor.undo();
    nudgeTiming(editor, "a", 1_000);

    expect(editor.history.undoStack).toHaveLength(1);
    expect(editor.history.redoStack).toHaveLength(0);
  });
});

describe("CueEditor.setTime", () => {
  it("re-sorts and renumbers cues when a typed start passes a neighbour", () => {
    const editor = newEditor();
    editor.loadTrack(
      trackA,
      [
        { ...cue("a", "first"), end_us: 5_000_000 },
        {
          ...cue("b", "second"),
          position: 1,
          start_us: 2_000_000,
          end_us: 3_000_000,
        },
      ],
      1,
    );

    editor.setTime(0, "start_us", 4_000_000);

    expect(
      editor.cues.map((item) => [item.id, item.position, item.start_us]),
    ).toEqual([
      ["b", 0, 2_000_000],
      ["a", 1, 4_000_000],
    ]);
    expect(editor.autosave.hasUnsavedChanges).toBe(true);
  });
});

describe("CueEditor command availability", () => {
  it("tracks selection, undo and redo", () => {
    const editor = newEditor();
    expect(editor.hasSelection).toBe(false);
    expect(editor.canUndo).toBe(false);

    editor.loadTrack(trackA, [cue("a", "first")], 1);
    expect(editor.hasSelection).toBe(true);

    editor.nudgeSelected(100);
    expect(editor.canUndo).toBe(true);
    expect(editor.canRedo).toBe(false);

    editor.undo();
    expect(editor.canUndo).toBe(false);
    expect(editor.canRedo).toBe(true);
  });
});

describe("CueEditor.undo", () => {
  it("keeps the selection in place when the selected cue disappears", () => {
    const editor = newEditor();
    const timed = (id: string, startUs: number): EditorCue => ({
      ...cue(id, `${id} text`),
      start_us: startUs,
      end_us: startUs + 1_000_000,
    });
    editor.loadTrack(
      trackA,
      [timed("a", 0), timed("b", 1_000_000), timed("c", 2_000_000)],
      1,
    );
    editor.select("c");
    editor.insertAfterSelected();
    expect(editor.selectedCueIndex).toBe(3);

    editor.undo();
    expect(editor.selectedCueId).toBe("c");
  });
});

describe("CueEditor read-only", () => {
  it("ignores every edit while read-only and accepts them again afterwards", () => {
    let locked = false;
    const editor = newEditor(() => locked);
    editor.loadTrack(trackA, [cue("a", "server"), cue("b", "next")], 1);
    editor.setText(0, "before the lock");
    editor.insertAfterSelected();
    const before = JSON.parse(JSON.stringify(editor.cues));
    locked = true;

    editor.setText(0, "typed while locked");
    editor.setTime(0, "end_us", 500_000);
    editor.splitSelected();
    editor.mergeSelected();
    editor.insertAfterSelected();
    editor.nudgeSelected(100);
    editor.retime({ id: "a", start_us: 0, end_us: 900_000 });
    editor.deleteSelected();
    editor.undo();

    expect(editor.cues).toEqual(before);
    expect(editor.canUndo).toBe(false);

    locked = false;
    expect(editor.canUndo).toBe(true);
    editor.setText(0, "after the lock");
    expect(editor.cues[0].text).toBe("after the lock");
  });
});

describe("CueEditor journal recovery while read-only", () => {
  const journalKeyA = "anysub:editor:project-a:track-a";

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
    editor.recoverDeferredJournal();
    expect(editor.cues[0].text).toBe("server");
    expect(localStorage.getItem(journalKeyA)).not.toBeNull();

    locked = false;
    editor.recoverDeferredJournal();
    expect(editor.cues[0].text).toBe("journaled edit");
    expect(editor.autosave.hasUnsavedChanges).toBe(true);
  });

  it("discards the deferred journal when a new track replaces the locked one", () => {
    let locked = true;
    const editor = newEditor(() => locked);
    storeJournal("journaled edit");
    editor.loadTrack(trackA, [cue("a", "server")], 1);

    locked = false;
    editor.loadTrack(trackB, [cue("b", "new transcript")], 1);
    editor.recoverDeferredJournal();

    expect(editor.cues[0].text).toBe("new transcript");
    expect(localStorage.getItem(journalKeyA)).toBeNull();
    expect(editor.autosave.message).toMatch(/discarded/);
  });
});
