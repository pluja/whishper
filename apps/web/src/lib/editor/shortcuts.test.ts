import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleStudioKeydown, type StudioCommands } from "./shortcuts";

class FakeElement {
  constructor(private readonly tagName: string) {}

  closest(selector: string): FakeElement | null {
    return selector.split(", ").includes(this.tagName) ? this : null;
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
    isGuideOpen: () => false,
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
  options: { ctrlKey?: boolean; shiftKey?: boolean; target?: string } = {},
) {
  return {
    key,
    ctrlKey: options.ctrlKey ?? false,
    metaKey: false,
    altKey: false,
    shiftKey: options.shiftKey ?? false,
    repeat: false,
    defaultPrevented: false,
    target: new FakeElement(options.target ?? "div"),
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

  it("leaves Ctrl+Z, Ctrl+Y and Ctrl+K to a focused textarea", () => {
    const studio = commands();
    for (const key of ["z", "y", "k"]) {
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
    expect(studio.splitSelected).not.toHaveBeenCalled();
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

  it("ignores plain transport keys while typing", () => {
    const studio = commands();
    const event = keydown("k", { target: "textarea" });
    press(event, studio);
    expect(studio.transport.playForwardAtNormalRate).not.toHaveBeenCalled();
    press(keydown("k"), studio);
    expect(studio.transport.playForwardAtNormalRate).toHaveBeenCalledOnce();
  });
});
