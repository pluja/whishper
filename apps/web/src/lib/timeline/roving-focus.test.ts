import { describe, expect, it } from "vitest";
import { focusableCueIndex, nextRovingIndex } from "./roving-focus";

describe("nextRovingIndex", () => {
  it("moves without wrapping", () => {
    expect(nextRovingIndex(0, "ArrowRight", 3)).toBe(1);
    expect(nextRovingIndex(2, "ArrowRight", 3)).toBe(2);
    expect(nextRovingIndex(0, "ArrowLeft", 3)).toBe(0);
  });
  it("jumps to the ends", () => {
    expect(nextRovingIndex(1, "Home", 3)).toBe(0);
    expect(nextRovingIndex(1, "End", 3)).toBe(2);
  });
  it("handles empty and single-cue timelines", () => {
    expect(nextRovingIndex(0, "ArrowRight", 0)).toBeNull();
    expect(nextRovingIndex(0, "ArrowRight", 1)).toBe(0);
  });
  it("ignores unrelated keys", () => {
    expect(nextRovingIndex(0, "Enter", 3)).toBeNull();
  });
});

describe("focusableCueIndex", () => {
  it("prefers the selection, then the first cue, then none", () => {
    expect(focusableCueIndex(2, 5)).toBe(2);
    expect(focusableCueIndex(-1, 5)).toBe(0);
    expect(focusableCueIndex(-1, 0)).toBe(-1);
    expect(focusableCueIndex(9, 3)).toBe(0);
  });
});
