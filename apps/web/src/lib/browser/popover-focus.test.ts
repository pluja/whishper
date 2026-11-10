import { afterEach, describe, expect, it, vi } from "vitest";
import { hideOnTab, returnFocusOnHide } from "./popover-focus";

function fakePanel(children: unknown[] = []) {
  return {
    contains: (node: unknown) => children.includes(node),
    hidePopover: vi.fn(),
  } as unknown as HTMLElement & { hidePopover: ReturnType<typeof vi.fn> };
}

function fakeTrigger() {
  return { focus: vi.fn() } as unknown as HTMLElement & {
    focus: ReturnType<typeof vi.fn>;
  };
}

function stubActiveElement(active: unknown) {
  const body = {};
  vi.stubGlobal("document", { body, activeElement: active ?? body });
}

describe("returnFocusOnHide", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("focuses the trigger when focus was inside the panel", () => {
    const item = {};
    const trigger = fakeTrigger();
    stubActiveElement(item);

    returnFocusOnHide(fakePanel([item]), trigger);

    expect(trigger.focus).toHaveBeenCalledOnce();
  });

  it("focuses the trigger when focus fell back to the body", () => {
    const trigger = fakeTrigger();
    stubActiveElement(null);

    returnFocusOnHide(fakePanel(), trigger);

    expect(trigger.focus).toHaveBeenCalledOnce();
  });

  it("leaves focus that moved outside the panel alone", () => {
    const trigger = fakeTrigger();
    stubActiveElement({ tagName: "INPUT" });

    returnFocusOnHide(fakePanel(), trigger);

    expect(trigger.focus).not.toHaveBeenCalled();
  });
});

describe("hideOnTab", () => {
  it("hides the panel on Tab and lets the key through", () => {
    const panel = fakePanel();
    const event = { key: "Tab" } as KeyboardEvent;

    expect(hideOnTab(event, panel)).toBe(true);
    expect(panel.hidePopover).toHaveBeenCalledOnce();
  });

  it("ignores other keys", () => {
    const panel = fakePanel();

    expect(hideOnTab({ key: "ArrowDown" } as KeyboardEvent, panel)).toBe(false);
    expect(panel.hidePopover).not.toHaveBeenCalled();
  });
});
