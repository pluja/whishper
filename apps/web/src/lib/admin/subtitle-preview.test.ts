import { describe, expect, it } from "vitest";

import { splitIntoSubtitles } from "./subtitle-preview";

describe("splitIntoSubtitles", () => {
  it("fills each subtitle with whole words up to the limit", () => {
    expect(splitIntoSubtitles("one two three four five", 9)).toEqual([
      "one two",
      "three",
      "four five",
    ]);
  });

  it("keeps a word longer than the limit on its own", () => {
    expect(splitIntoSubtitles("a extraordinarily b", 5)).toEqual([
      "a",
      "extraordinarily",
      "b",
    ]);
  });

  it("returns nothing for blank text", () => {
    expect(splitIntoSubtitles("   ", 42)).toEqual([]);
  });
});
