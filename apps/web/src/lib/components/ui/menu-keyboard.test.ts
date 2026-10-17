import { describe, expect, it } from "vitest";
import { nextMenuIndex } from "./menu-keyboard";

const all = [true, true, true];

describe("nextMenuIndex", () => {
  it("moves down and up with wrapping", () => {
    expect(nextMenuIndex(0, "ArrowDown", all)).toBe(1);
    expect(nextMenuIndex(2, "ArrowDown", all)).toBe(0);
    expect(nextMenuIndex(0, "ArrowUp", all)).toBe(2);
  });
  it("jumps to the first and last enabled item", () => {
    expect(nextMenuIndex(1, "Home", [false, true, true])).toBe(1);
    expect(nextMenuIndex(0, "End", [true, true, false])).toBe(1);
  });
  it("skips disabled items", () => {
    expect(nextMenuIndex(0, "ArrowDown", [true, false, true])).toBe(2);
    expect(nextMenuIndex(2, "ArrowUp", [true, false, true])).toBe(0);
  });
  it("starts from nothing focused", () => {
    expect(nextMenuIndex(-1, "ArrowDown", all)).toBe(0);
    expect(nextMenuIndex(-1, "ArrowUp", all)).toBe(2);
  });
  it("returns null when every item is disabled or the key is unrelated", () => {
    expect(nextMenuIndex(0, "ArrowDown", [false, false])).toBeNull();
    expect(nextMenuIndex(0, "a", all)).toBeNull();
  });
});
