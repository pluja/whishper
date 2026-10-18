import { describe, expect, it } from "vitest";

import { ToolbarFocus } from "./toolbar-focus.svelte";

function focusEvent(target: unknown): FocusEvent {
  return { target } as unknown as FocusEvent;
}

describe("ToolbarFocus", () => {
  it("puts the tab stop on the first enabled button", () => {
    const focus = new ToolbarFocus(() => [true, false, false]);
    expect(focus.tabStopIndex).toBe(1);
    expect(focus.tabIndex(1)).toBe(0);
    expect(focus.tabIndex(0)).toBe(-1);
  });

  it("has no tab stop when every button is disabled", () => {
    const focus = new ToolbarFocus(() => [true, true]);
    expect(focus.tabStopIndex).toBe(-1);
  });

  it("keeps the last focused button and moves on when it is disabled", () => {
    const buttons = [{}, {}, {}];
    const state = $state({ disabled: [false, false, false] });
    const focus = new ToolbarFocus(() => state.disabled);
    focus.element = {
      querySelectorAll: () => buttons,
    } as unknown as HTMLElement;

    focus.handleFocusIn(focusEvent(buttons[2]));
    expect(focus.tabStopIndex).toBe(2);

    state.disabled = [true, false, true];
    expect(focus.tabStopIndex).toBe(1);
  });
});
