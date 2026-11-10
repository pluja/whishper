import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  handleStudioKeydown,
  shortcutAriaKeys,
  shortcutGroups,
  shortcutLabel,
  type StudioCommands,
} from "./shortcuts";

// Matches the selectors of the element itself and its ancestors.
class FakeElement {
  constructor(private readonly selectors: string[]) {}

  closest(selector: string): FakeElement | null {
    const parts = selector.split(",").map((part) => part.trim());
    return parts.some((part) => this.selectors.includes(part)) ? this : null;
  }
}

function commands(): StudioCommands {
  const transport = {
    togglePlayback: vi.fn(() => true),
    startReverseShuttle: vi.fn(() => true),
    playForwardAtNormalRate: vi.fn(() => true),
    startForwardShuttle: vi.fn(() => true),
    stepFrames: vi.fn(() => true),
    jumpToCueStart: vi.fn(() => true),
    goToSourceEdge: vi.fn(() => true),
  };
  return {
    transport,
    isDialogOpen: () => false,
    openGuide: vi.fn(),
    canSave: () => true,
    save: vi.fn(),
    canUndo: () => true,
    undo: vi.fn(),
    canRedo: () => true,
    redo: vi.fn(),
    hasSelection: () => true,
    splitSelected: vi.fn(),
    deleteSelected: vi.fn(),
    setSelectedTimeToPlayhead: vi.fn(),
  };
}

function keydown(
  key: string,
  options: {
    ctrlKey?: boolean;
    shiftKey?: boolean;
    target?: string | string[];
  } = {},
) {
  return {
    key,
    ctrlKey: options.ctrlKey ?? false,
    metaKey: false,
    altKey: false,
    shiftKey: options.shiftKey ?? false,
    repeat: false,
    defaultPrevented: false,
    target: new FakeElement([options.target ?? "div"].flat()),
    preventDefault: vi.fn(),
  };
}

function press(
  event: ReturnType<typeof keydown>,
  studio: StudioCommands,
): void {
  handleStudioKeydown(event as unknown as KeyboardEvent, studio);
}

describe("handleStudioKeydown", () => {
  beforeEach(() => vi.stubGlobal("Element", FakeElement));
  afterEach(() => vi.unstubAllGlobals());

  it("leaves Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z to a focused text field", () => {
    const studio = commands();
    for (const key of ["z", "y"]) {
      const event = keydown(key, { ctrlKey: true, target: "textarea" });
      press(event, studio);
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
    const redo = keydown("z", {
      ctrlKey: true,
      shiftKey: true,
      target: "input",
    });
    press(redo, studio);
    expect(redo.preventDefault).not.toHaveBeenCalled();
    expect(studio.undo).not.toHaveBeenCalled();
    expect(studio.redo).not.toHaveBeenCalled();
  });

  it("sends undo and redo from a field without native undo to the cues", () => {
    const studio = commands();
    const field = ["input", "[data-no-native-undo]"];
    const undo = keydown("z", { ctrlKey: true, target: field });
    press(undo, studio);
    press(
      keydown("z", { ctrlKey: true, shiftKey: true, target: field }),
      studio,
    );
    press(keydown("y", { ctrlKey: true, target: field }), studio);
    expect(undo.preventDefault).toHaveBeenCalledOnce();
    expect(studio.undo).toHaveBeenCalledOnce();
    expect(studio.redo).toHaveBeenCalledTimes(2);
  });

  it("splits at the caret with Ctrl+K from inside a textarea", () => {
    const studio = commands();
    const event = keydown("k", { ctrlKey: true, target: "textarea" });
    press(event, studio);
    expect(studio.splitSelected).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it("saves with Ctrl+S from inside a textarea", () => {
    const studio = commands();
    const event = keydown("s", { ctrlKey: true, target: "textarea" });
    press(event, studio);
    expect(studio.save).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it("runs cue undo, redo and split outside text fields", () => {
    const studio = commands();
    press(keydown("z", { ctrlKey: true }), studio);
    press(keydown("z", { ctrlKey: true, shiftKey: true }), studio);
    press(keydown("y", { ctrlKey: true }), studio);
    press(keydown("k", { ctrlKey: true }), studio);
    expect(studio.undo).toHaveBeenCalledOnce();
    expect(studio.redo).toHaveBeenCalledTimes(2);
    expect(studio.splitSelected).toHaveBeenCalledOnce();
  });

  it("leaves every key to an open menu", () => {
    const studio = commands();
    const insideMenu = ["button", '[role="menu"]', "[popover]"];
    const events = [
      keydown("ArrowLeft", { target: insideMenu }),
      keydown("ArrowRight", { shiftKey: true, target: insideMenu }),
      keydown("Delete", { shiftKey: true, target: insideMenu }),
      keydown("Backspace", { shiftKey: true, target: insideMenu }),
      keydown("k", { ctrlKey: true, target: insideMenu }),
      keydown("j", { target: insideMenu }),
    ];
    for (const event of events) {
      press(event, studio);
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
    expect(studio.transport.stepFrames).not.toHaveBeenCalled();
    expect(studio.transport.startReverseShuttle).not.toHaveBeenCalled();
    expect(studio.deleteSelected).not.toHaveBeenCalled();
    expect(studio.splitSelected).not.toHaveBeenCalled();
  });

  it("leaves every key to an open picker, from its search field or list", () => {
    const studio = commands();
    for (const focused of ["input", '[role="listbox"]']) {
      const insidePicker = [focused, "[popover]"];
      const events = [
        keydown("ArrowDown", { target: insidePicker }),
        keydown("ArrowUp", { target: insidePicker }),
        keydown("ArrowLeft", { target: insidePicker }),
        keydown("Home", { target: insidePicker }),
        keydown("End", { target: insidePicker }),
        keydown("j", { target: insidePicker }),
        keydown("k", { target: insidePicker }),
        keydown("l", { target: insidePicker }),
        keydown(" ", { target: insidePicker }),
        keydown("?", { target: insidePicker }),
        keydown("Delete", { shiftKey: true, target: insidePicker }),
        keydown("k", { ctrlKey: true, target: insidePicker }),
      ];
      for (const event of events) {
        press(event, studio);
        expect(event.preventDefault).not.toHaveBeenCalled();
      }
    }
    const { transport } = studio;
    expect(transport.jumpToCueStart).not.toHaveBeenCalled();
    expect(transport.stepFrames).not.toHaveBeenCalled();
    expect(transport.goToSourceEdge).not.toHaveBeenCalled();
    expect(transport.startReverseShuttle).not.toHaveBeenCalled();
    expect(transport.playForwardAtNormalRate).not.toHaveBeenCalled();
    expect(transport.startForwardShuttle).not.toHaveBeenCalled();
    expect(transport.togglePlayback).not.toHaveBeenCalled();
    expect(studio.openGuide).not.toHaveBeenCalled();
    expect(studio.deleteSelected).not.toHaveBeenCalled();
    expect(studio.splitSelected).not.toHaveBeenCalled();
  });

  it("deletes the selected cue with Shift+Delete outside menus", () => {
    const studio = commands();
    const event = keydown("Delete", { shiftKey: true, target: "button" });
    press(event, studio);
    expect(studio.deleteSelected).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it("deletes one cue per press of a held Shift+Delete or Shift+Backspace", () => {
    const studio = commands();
    for (const key of ["Delete", "Backspace"]) {
      press({ ...keydown(key, { shiftKey: true }), repeat: true }, studio);
    }
    expect(studio.deleteSelected).not.toHaveBeenCalled();
  });

  it("sets the selected cue's In and Out to the playhead with I and O", () => {
    const studio = commands();
    const setIn = keydown("i", { target: "button" });
    press(setIn, studio);
    press(keydown("O"), studio);
    expect(studio.setSelectedTimeToPlayhead).toHaveBeenNthCalledWith(
      1,
      "start_us",
    );
    expect(studio.setSelectedTimeToPlayhead).toHaveBeenNthCalledWith(
      2,
      "end_us",
    );
    expect(setIn.preventDefault).toHaveBeenCalledOnce();
  });

  it("ignores held I and O", () => {
    const studio = commands();
    press({ ...keydown("i"), repeat: true }, studio);
    press({ ...keydown("o"), repeat: true }, studio);
    expect(studio.setSelectedTimeToPlayhead).not.toHaveBeenCalled();
  });

  it("leaves I and O alone while typing, in a menu or without a selection", () => {
    const studio = commands();
    press(keydown("i", { target: "textarea" }), studio);
    press(keydown("o", { target: ["input", "[data-no-native-undo]"] }), studio);
    press(keydown("i", { target: ["button", "[popover]"] }), studio);
    press(keydown("o", { ctrlKey: true }), studio);
    press(keydown("I", { shiftKey: true }), studio);
    press(keydown("i"), { ...studio, isDialogOpen: () => true });
    press(keydown("o"), { ...studio, hasSelection: () => false });
    expect(studio.setSelectedTimeToPlayhead).not.toHaveBeenCalled();
  });

  it("ignores plain transport keys while typing", () => {
    const studio = commands();
    const event = keydown("k", { target: "textarea" });
    press(event, studio);
    expect(studio.transport.playForwardAtNormalRate).not.toHaveBeenCalled();
    press(keydown("k"), studio);
    expect(studio.transport.playForwardAtNormalRate).toHaveBeenCalledOnce();
  });
});

describe("shortcut hints", () => {
  it("spell a shortcut the way the guide does", () => {
    expect(shortcutLabel("redo")).toBe("Ctrl/Command+Shift+Z");
    expect(shortcutLabel("set-start")).toBe("I");
  });

  it("expose every key combination to assistive technology", () => {
    expect(shortcutAriaKeys("delete")).toBe("Shift+Delete Shift+Backspace");
    expect(shortcutAriaKeys("timeline-move")).toBeUndefined();
  });

  it("are looked up by ids that the guide never repeats", () => {
    const ids = shortcutGroups.flatMap((group) =>
      group.shortcuts.map((shortcut) => shortcut.id),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});
