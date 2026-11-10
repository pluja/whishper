import { describe, expect, it } from "vitest";

import { revealOffset } from "./reveal";

describe("revealOffset", () => {
  const list = { top: 100, bottom: 400 };

  it("leaves a visible row where it is", () => {
    expect(revealOffset(list, { top: 150, bottom: 200 })).toBe(0);
  });

  it("scrolls up just far enough to show a row above the list", () => {
    expect(revealOffset(list, { top: 60, bottom: 110 })).toBe(-40);
  });

  it("scrolls down just far enough to show a row below the list", () => {
    expect(revealOffset(list, { top: 380, bottom: 430 })).toBe(30);
  });
});
