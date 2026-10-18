import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleStudioKeydown, type StudioCommands } from "./shortcuts";

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
    const insideMenu = ["button", '[role="menu"]'];
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

  it("deletes the selected cue with Shift+Delete outside menus", () => {
    const studio = commands();
    const event = keydown("Delete", { shiftKey: true, target: "button" });
    press(event, studio);
    expect(studio.deleteSelected).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
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
