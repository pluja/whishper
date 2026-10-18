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
    const page = { body: {}, activeElement: element as unknown };
    vi.stubGlobal("document", page);
    const update = vi.fn(() => {
      page.activeElement = page.body;
    });

    expect(await keepFocusThrough(element, update)).toBe(true);
    expect(update).toHaveBeenCalledOnce();
    expect(element.focus).toHaveBeenCalledOnce();
  });

  it("never focuses an element that had no focus before the update", async () => {
    const element = fakeElement();
    stubActiveElement(null);

    expect(await keepFocusThrough(element, () => {})).toBe(false);
    expect(element.focus).not.toHaveBeenCalled();
  });

  it("leaves focus alone when it moved to another element", async () => {
    const element = fakeElement();
    stubActiveElement({ tagName: "BUTTON" });

    expect(await keepFocusThrough(element, () => {})).toBe(false);
    expect(element.focus).not.toHaveBeenCalled();
  });

  it("does not focus an element the update removed", async () => {
    const element = fakeElement(false);
    stubActiveElement(element);

    expect(await keepFocusThrough(element, () => {})).toBe(false);
    expect(element.focus).not.toHaveBeenCalled();
  });
});
