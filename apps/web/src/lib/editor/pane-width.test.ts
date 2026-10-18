import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PaneWidth } from "./pane-width.svelte";

const RESIZING_CLASS = "resizing-studio-pane";

let bodyClasses: Set<string>;
let storage: Map<string, string>;

function separator(): EventTarget {
  return Object.assign(new EventTarget(), { setPointerCapture: () => {} });
}

function pointerDown(target: EventTarget, clientX = 1000): PointerEvent {
  return {
    clientX,
    pointerId: 1,
    currentTarget: target,
    preventDefault: () => {},
  } as unknown as PointerEvent;
}

function keyDown(key: string): KeyboardEvent {
  return { key, preventDefault: () => {} } as KeyboardEvent;
}

function pointerMove(clientX: number): Event {
  return Object.assign(new Event("pointermove"), { clientX });
}

beforeEach(() => {
  bodyClasses = new Set();
  storage = new Map();
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), { innerWidth: 1600 }),
  );
  vi.stubGlobal("document", {
    body: {
      classList: {
        add: (name: string) => bodyClasses.add(name),
        remove: (name: string) => bodyClasses.delete(name),
      },
    },
  });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PaneWidth", () => {
  it("resizes while dragging and persists on release", () => {
    const pane = new PaneWidth();
    pane.beginResize(pointerDown(separator()));
    expect(bodyClasses.has(RESIZING_CLASS)).toBe(true);

    window.dispatchEvent(pointerMove(900));
    expect(pane.width).toBe(600);
    window.dispatchEvent(new Event("pointerup"));

    expect(bodyClasses.has(RESIZING_CLASS)).toBe(false);
    expect(storage.get("anysub:editor-pane-width")).toBe("600");
  });

  it("ends the resize when the browser cancels the pointer", () => {
    const pane = new PaneWidth();
    pane.beginResize(pointerDown(separator()));

    window.dispatchEvent(new Event("pointercancel"));

    expect(bodyClasses.has(RESIZING_CLASS)).toBe(false);
  });

  it("ends the resize when the separator loses pointer capture", () => {
    const pane = new PaneWidth();
    const target = separator();
    pane.beginResize(pointerDown(target));

    target.dispatchEvent(new Event("lostpointercapture"));
    window.dispatchEvent(pointerMove(500));

    expect(bodyClasses.has(RESIZING_CLASS)).toBe(false);
    expect(pane.width).toBe(500);
  });

  it("exposes its range and rounded width for the separator", () => {
    const pane = new PaneWidth();
    pane.width = 500.4;

    expect([pane.min, pane.value, pane.max]).toEqual([360, 500, 760]);
  });

  it("narrows its range and value to fit a smaller viewport", () => {
    vi.stubGlobal(
      "window",
      Object.assign(new EventTarget(), { innerWidth: 1100 }),
    );
    const pane = new PaneWidth();
    pane.width = 700;

    expect(pane.max).toBe(572);
    expect(pane.value).toBe(572);
    pane.resizeWithKeyboard(keyDown("ArrowRight"));
    expect(pane.value).toBe(548);
  });

  it("steps with the arrow keys and stays within its range", () => {
    const pane = new PaneWidth();
    pane.resizeWithKeyboard(keyDown("ArrowLeft"));
    expect(pane.width).toBe(524);
    expect(storage.get("anysub:editor-pane-width")).toBe("524");

    pane.width = 370;
    pane.resizeWithKeyboard(keyDown("ArrowRight"));
    expect(pane.width).toBe(360);
  });

  it("keeps working when the browser blocks storage", () => {
    const blocked = () => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    };
    vi.stubGlobal("localStorage", {
      getItem: blocked,
      setItem: blocked,
      removeItem: blocked,
    });
    const pane = new PaneWidth();

    expect(() => pane.restore()).not.toThrow();
    pane.beginResize(pointerDown(separator()));
    expect(() => window.dispatchEvent(new Event("pointerup"))).not.toThrow();
    expect(bodyClasses.has(RESIZING_CLASS)).toBe(false);
  });
});
