import { afterEach, describe, expect, it, vi } from "vitest";
import { keepFocusThrough } from "./focus";

function fakeElement(isConnected = true) {
  return { isConnected, focus: vi.fn() } as unknown as HTMLElement & {
    focus: ReturnType<typeof vi.fn>;
  };
}

function stubActiveElement(active: unknown): { body: object } {
  const body = {};
  vi.stubGlobal("document", { body, activeElement: active ?? body });
  return { body };
}

describe("keepFocusThrough", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("refocuses an element that lost focus during the update", async () => {
    const element = fakeElement();
    stubActiveElement(null);
    const update = vi.fn();

    expect(await keepFocusThrough(element, update)).toBe(true);
    expect(update).toHaveBeenCalledOnce();
    expect(element.focus).toHaveBeenCalledOnce();
  });

  it("leaves focus alone when it moved to another element", async () => {
    const element = fakeElement();
    stubActiveElement({ tagName: "BUTTON" });

    expect(await keepFocusThrough(element, () => {})).toBe(false);
    expect(element.focus).not.toHaveBeenCalled();
  });

  it("does not focus an element the update removed", async () => {
    const element = fakeElement(false);
    stubActiveElement(null);

    expect(await keepFocusThrough(element, () => {})).toBe(false);
    expect(element.focus).not.toHaveBeenCalled();
  });
});
