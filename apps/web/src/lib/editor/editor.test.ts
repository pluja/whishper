import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EditorCue } from "./cues";
import type { CueEditor } from "./editor.svelte";
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
    expect(editor.autosave.notice).toBeNull();
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

describe("CueEditor time field sessions", () => {
  function editorWithCue(): CueEditor {
    const editor = newEditor();
    editor.loadTrack(trackA, [cue("a", "first")], 1);
    return editor;
  }

  it("records every change made while a field has focus as one undo step", () => {
    const editor = editorWithCue();
    editor.beginEdit();
    editor.setTime(0, "end_us", 1_100_000);
    editor.setTime(0, "end_us", 1_200_000);
    editor.setTime(0, "end_us", 1_300_000);
    editor.finishEdit();

    expect(editor.history.undoStack).toHaveLength(1);
    editor.undo();
    expect(editor.cues[0].end_us).toBe(1_000_000);
  });

  it("undoes the changes made so far without leaving the field", () => {
    const editor = editorWithCue();
    editor.beginEdit();
    editor.setTime(0, "end_us", 1_200_000);
    editor.undo();

    expect(editor.cues[0].end_us).toBe(1_000_000);
    expect(editor.editing).toBe(true);

    editor.setTime(0, "end_us", 1_500_000);
    editor.finishEdit();
    expect(editor.history.undoStack).toHaveLength(1);
    expect(editor.history.redoStack).toHaveLength(0);
    editor.undo();
    expect(editor.cues[0].end_us).toBe(1_000_000);
  });

  it("redoes inside the field without recording another step", () => {
    const editor = editorWithCue();
    editor.beginEdit();
    editor.setTime(0, "end_us", 1_200_000);
    editor.undo();
    editor.redo();
    editor.finishEdit();

    expect(editor.cues[0].end_us).toBe(1_200_000);
    expect(editor.history.undoStack).toHaveLength(1);
    expect(editor.history.redoStack).toHaveLength(0);
  });
});

describe("CueEditor.setTimeToPlayhead", () => {
  function editorAt(playbackUs: number, readOnly = () => false): CueEditor {
    const editor = newEditor(readOnly);
    editor.loadTrack(
      trackA,
      [
        { ...cue("a", "first"), start_us: 1_000_000, end_us: 2_000_000 },
        { ...cue("b", "second"), start_us: 3_000_000, end_us: 4_000_000 },
      ],
      1,
    );
    editor.transport.playbackUs = playbackUs;
    return editor;
  }

  it("sets the start or the end to the playhead, one undo step each", () => {
    const editor = editorAt(500_000);
    editor.setTimeToPlayhead(0, "start_us");
    editor.transport.playbackUs = 2_500_000;
    editor.setTimeToPlayhead(0, "end_us");

    expect(editor.cues[0]).toMatchObject({
      start_us: 500_000,
      end_us: 2_500_000,
    });
    expect(editor.history.undoStack).toHaveLength(2);
    expect(editor.autosave.hasUnsavedChanges).toBe(true);
    editor.undo();
    expect(editor.cues[0].end_us).toBe(2_000_000);
  });

  it("refuses an In after the Out and reports it on that field", () => {
    const editor = editorAt(2_500_000);
    editor.setTimeToPlayhead(0, "start_us");

    expect(editor.cues[0].start_us).toBe(1_000_000);
    expect(editor.history.undoStack).toHaveLength(0);
    expect(editor.timeError).toEqual({
      cueId: "a",
      field: "start_us",
      message: "In must not be later than Out.",
    });

    editor.transport.playbackUs = 1_500_000;
    editor.setTimeToPlayhead(0, "start_us");
    expect(editor.cues[0].start_us).toBe(1_500_000);
    expect(editor.timeError).toBeNull();
  });

  it("refuses an Out before the In", () => {
    const editor = editorAt(3_500_000);
    editor.setTimeToPlayhead(1, "end_us");
    editor.transport.playbackUs = 500_000;
    editor.setTimeToPlayhead(0, "end_us");

    expect(editor.cues[0].end_us).toBe(2_000_000);
    expect(editor.timeError).toEqual({
      cueId: "a",
      field: "end_us",
      message: "Out must not be earlier than In.",
    });
  });

  it("does nothing while read-only or without a cue", () => {
    const editor = editorAt(1_500_000, () => true);
    editor.setTimeToPlayhead(0, "end_us");
    editor.setTimeToPlayhead(-1, "end_us");

    expect(editor.cues[0].end_us).toBe(2_000_000);
    expect(editor.timeError).toBeNull();
  });
});

describe("CueEditor time errors", () => {
  it("clears an error only from the field that shows it", () => {
    const editor = newEditor();
    editor.loadTrack(trackA, [cue("a", "first")], 1);
    editor.showTimeError("a", "end_us", "Out must not be earlier than In.");

    editor.clearTimeError("a", "start_us");
    expect(editor.timeError?.field).toBe("end_us");
    editor.clearTimeError("a", "end_us");
    expect(editor.timeError).toBeNull();
  });

  it("drops a stale error when the cues change by undo or another edit", () => {
    const editor = newEditor();
    editor.loadTrack(trackA, [cue("a", "first")], 1);
    editor.nudgeSelected(100);
    editor.showTimeError("a", "end_us", "Out must not be earlier than In.");
    editor.undo();
    expect(editor.timeError).toBeNull();

    editor.showTimeError("a", "end_us", "Out must not be earlier than In.");
    editor.insertAfterSelected();
    expect(editor.timeError).toBeNull();
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
