import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { CueEditor } from "./editor.svelte";
import {
  cue,
  newEditor,
  restoreEditorGlobals,
  stubEditorGlobals,
  trackA,
  trackB,
} from "./testing";

beforeEach(() => {
  stubEditorGlobals();
});

afterEach(restoreEditorGlobals);

describe("CueEditor time field sessions", () => {
  function editorWithCue(): CueEditor {
    const editor = newEditor();
    editor.loadTrack(trackA, [cue("a", "first")], 1);
    return editor;
  }

  it("records every change made while a field has focus as one undo step", () => {
    const editor = editorWithCue();
    editor.beginEdit("a");
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
    editor.beginEdit("a");
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
    editor.beginEdit("a");
    editor.setTime(0, "end_us", 1_200_000);
    editor.undo();
    editor.redo();
    editor.finishEdit();

    expect(editor.cues[0].end_us).toBe(1_200_000);
    expect(editor.history.undoStack).toHaveLength(1);
    expect(editor.history.redoStack).toHaveLength(0);
  });
  it("offers undo for a session's own changes before any earlier step", () => {
    const editor = editorWithCue();
    editor.beginEdit("a");
    expect(editor.canUndo).toBe(false);
    editor.setTime(0, "end_us", 1_200_000);

    expect(editor.canUndo).toBe(true);
    editor.undo();
    expect(editor.cues[0].end_us).toBe(1_000_000);
  });

  it("keeps undo inside a clean session away from earlier steps", () => {
    const editor = editorWithCue();
    editor.nudgeSelected(100);
    editor.beginEdit("a");
    editor.undo();

    expect(editor.cues[0].start_us).toBe(100_000);
    expect(editor.history.undoStack).toHaveLength(1);
    expect(editor.editing).toBe(true);

    editor.setTime(0, "end_us", 1_500_000);
    editor.undo();
    editor.undo();
    expect(editor.cues[0]).toMatchObject({
      start_us: 100_000,
      end_us: 1_100_000,
    });

    editor.finishEdit();
    editor.undo();
    expect(editor.cues[0].start_us).toBe(0);
  });

  it("closes the session when the edited cue disappears", () => {
    const editor = newEditor();
    editor.loadTrack(
      trackA,
      [
        cue("a", "first"),
        { ...cue("b", "second"), start_us: 2_000_000, end_us: 3_000_000 },
      ],
      1,
    );
    editor.select("b");
    editor.beginEdit("b");
    editor.setTime(1, "end_us", 3_500_000);
    editor.deleteSelected();

    expect(editor.editing).toBe(false);
    expect(editor.history.undoStack).toHaveLength(2);

    editor.beginEdit("a");
    editor.setTime(0, "end_us", 1_200_000);
    editor.finishEdit();
    expect(editor.history.undoStack).toHaveLength(3);
    editor.undo();
    expect(editor.cues.map((item) => item.id)).toEqual(["a"]);
    expect(editor.cues[0].end_us).toBe(1_000_000);
  });

  it("drops an open session when another track loads", () => {
    const editor = editorWithCue();
    editor.beginEdit("a");
    editor.setTime(0, "end_us", 1_200_000);
    editor.loadTrack(trackB, [cue("b", "other")], 1);

    expect(editor.editing).toBe(false);
    editor.beginEdit("b");
    editor.finishEdit();
    expect(editor.history.undoStack).toHaveLength(0);
  });
});

describe("CueEditor.setTimeToPlayhead", () => {
  function editorAt(
    playbackUs: number,
    readOnly = () => false,
    sourceDurationUs = 0,
  ): CueEditor {
    const editor = newEditor(readOnly, sourceDurationUs);
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

  it("never sets a time past the end of the source", () => {
    const editor = editorAt(9_000_000, () => false, 3_800_000);
    editor.setTimeToPlayhead(1, "end_us");

    expect(editor.cues[1].end_us).toBe(3_800_000);
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

  it("drops a cue's error once that cue is edited into a valid state", () => {
    const editor = newEditor();
    editor.loadTrack(trackA, [cue("a", "first"), cue("b", "second")], 1);
    editor.showTimeError("a", "end_us", "Out must not be earlier than In.");
    editor.setText(1, "other cue");
    expect(editor.timeError?.cueId).toBe("a");

    editor.setText(0, "edited");
    expect(editor.timeError).toBeNull();

    editor.showTimeError("a", "start_us", "In must not be later than Out.");
    editor.setTime(0, "end_us", 1_500_000);
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
