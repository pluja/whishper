import { describe, expect, it } from "vitest";
import { timelineKeyAction, type TimelineKey } from "./key-action";
import type { TimingPart } from "./math";

function press(key: string, modifiers: Partial<TimelineKey> = {}): TimelineKey {
  return {
    key,
    altKey: false,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    ...modifiers,
  };
}

const PARTS: TimingPart[] = ["whole", "start", "end"];
const HANDLES: TimingPart[] = ["start", "end"];

function action(
  event: TimelineKey,
  part: TimingPart,
  { editable = true, dragging = false } = {},
) {
  return timelineKeyAction(event, part, editable, dragging);
}

describe("timelineKeyAction", () => {
  describe("nudges", () => {
    it("moves the focused part by a millisecond with Alt", () => {
      for (const part of PARTS) {
        expect(action(press("ArrowLeft", { altKey: true }), part)).toEqual({
          kind: "nudge",
          edge: part,
          deltaUs: -1_000,
        });
        expect(action(press("ArrowRight", { altKey: true }), part)).toEqual({
          kind: "nudge",
          edge: part,
          deltaUs: 1_000,
        });
      }
    });

    it("moves by 100 milliseconds with Alt and Shift", () => {
      expect(
        action(press("ArrowLeft", { altKey: true, shiftKey: true }), "start"),
      ).toEqual({ kind: "nudge", edge: "start", deltaUs: -100_000 });
      expect(
        action(press("ArrowRight", { altKey: true, shiftKey: true }), "whole"),
      ).toEqual({ kind: "nudge", edge: "whole", deltaUs: 100_000 });
    });

    it("leaves Alt with Ctrl or Meta to the browser", () => {
      for (const modifier of [{ ctrlKey: true }, { metaKey: true }]) {
        expect(
          action(press("ArrowLeft", { altKey: true, ...modifier }), "whole"),
        ).toEqual({ kind: "none" });
        expect(
          action(press("ArrowRight", { altKey: true, ...modifier }), "start"),
        ).toEqual({ kind: "none" });
      }
    });

    it("lets Shift without Alt fall through", () => {
      for (const part of PARTS) {
        expect(action(press("ArrowLeft", { shiftKey: true }), part)).toEqual({
          kind: "none",
        });
        expect(action(press("ArrowRight", { shiftKey: true }), part)).toEqual({
          kind: "none",
        });
      }
    });
  });

  describe("handle focus", () => {
    it("focuses the start or end handle with [ and ]", () => {
      for (const part of PARTS) {
        expect(action(press("["), part)).toEqual({
          kind: "focus_handle",
          edge: "start",
        });
        expect(action(press("]"), part)).toEqual({
          kind: "focus_handle",
          edge: "end",
        });
      }
    });

    it("accepts brackets typed with Option, AltGr or Shift", () => {
      for (const modifiers of [
        { altKey: true },
        { ctrlKey: true, altKey: true },
        { shiftKey: true },
        { altKey: true, shiftKey: true },
      ]) {
        expect(action(press("[", modifiers), "whole")).toEqual({
          kind: "focus_handle",
          edge: "start",
        });
        expect(action(press("]", modifiers), "start")).toEqual({
          kind: "focus_handle",
          edge: "end",
        });
      }
    });

    it("leaves Cmd and Ctrl bracket shortcuts to the browser", () => {
      for (const modifiers of [
        { metaKey: true },
        { metaKey: true, altKey: true },
        { metaKey: true, shiftKey: true },
        { ctrlKey: true },
        { ctrlKey: true, shiftKey: true },
      ]) {
        for (const part of PARTS) {
          expect(action(press("[", modifiers), part)).toEqual({ kind: "none" });
          expect(action(press("]", modifiers), part)).toEqual({ kind: "none" });
        }
      }
    });
  });

  describe("Escape", () => {
    it("cancels a drag on any part", () => {
      for (const part of PARTS) {
        expect(action(press("Escape"), part, { dragging: true })).toEqual({
          kind: "cancel_drag",
        });
      }
    });

    it("returns from a handle to the cue without a drag", () => {
      for (const part of HANDLES) {
        expect(action(press("Escape"), part)).toEqual({
          kind: "return_to_body",
        });
      }
    });

    it("offers Escape on the cue body to navigation without a drag", () => {
      expect(action(press("Escape"), "whole")).toEqual({
        kind: "navigate",
        key: "Escape",
      });
    });
  });

  describe("navigation", () => {
    it("offers unmodified keys on the cue body to navigation", () => {
      for (const key of ["ArrowLeft", "ArrowRight", "Home", "End"]) {
        expect(action(press(key), "whole")).toEqual({ kind: "navigate", key });
      }
    });

    it("ignores modified keys on the cue body", () => {
      for (const modifiers of [
        { ctrlKey: true },
        { metaKey: true },
        { shiftKey: true },
      ]) {
        expect(action(press("Home", modifiers), "whole")).toEqual({
          kind: "none",
        });
      }
    });

    it("leaves plain arrows on a handle to the playhead", () => {
      for (const part of HANDLES) {
        expect(action(press("ArrowLeft"), part)).toEqual({ kind: "none" });
        expect(action(press("Home"), part)).toEqual({ kind: "none" });
      }
    });
  });

  describe("while locked", () => {
    const locked = { editable: false };

    it("still navigates between cues", () => {
      expect(action(press("ArrowRight"), "whole", locked)).toEqual({
        kind: "navigate",
        key: "ArrowRight",
      });
    });

    it("claims Alt nudges without changing timing", () => {
      expect(
        action(press("ArrowLeft", { altKey: true }), "whole", locked),
      ).toEqual({ kind: "block" });
      expect(
        action(
          press("ArrowRight", { altKey: true, shiftKey: true }),
          "whole",
          locked,
        ),
      ).toEqual({ kind: "block" });
    });

    it("does nothing for brackets", () => {
      expect(action(press("["), "whole", locked)).toEqual({ kind: "none" });
      expect(action(press("]", { altKey: true }), "whole", locked)).toEqual({
        kind: "none",
      });
    });
  });
});
