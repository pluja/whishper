import { describe, expect, it } from "vitest";

import {
  clampToDuration,
  knownDurationUs,
  maxCueEndUs,
} from "./source-duration";

describe("knownDurationUs", () => {
  it("keeps positive safe integers, including numeric strings", () => {
    expect(knownDurationUs(5_000_000)).toBe(5_000_000);
    expect(knownDurationUs("5000000")).toBe(5_000_000);
  });

  it.each([null, undefined, 0, -1, 1.5, "soon", Number.MAX_VALUE])(
    "treats %s as unknown",
    (value) => {
      expect(knownDurationUs(value)).toBe(0);
    },
  );
});

describe("maxCueEndUs", () => {
  it("allows cues up to the longer of the media and the transcript", () => {
    expect(maxCueEndUs(10_000_000, 10_400_000)).toBe(10_400_000);
    expect(maxCueEndUs(10_000_000, 9_000_000)).toBe(10_000_000);
  });

  it("uses whichever duration is known, or zero when neither is", () => {
    expect(maxCueEndUs(null, 9_000_000)).toBe(9_000_000);
    expect(maxCueEndUs(10_000_000, undefined)).toBe(10_000_000);
    expect(maxCueEndUs(null, undefined)).toBe(0);
  });
});

describe("clampToDuration", () => {
  it("keeps a time between zero and a known duration", () => {
    expect(clampToDuration(-5, 1_000)).toBe(0);
    expect(clampToDuration(500, 1_000)).toBe(500);
    expect(clampToDuration(1_500, 1_000)).toBe(1_000);
  });

  it("bounds only the start while the duration is unknown", () => {
    expect(clampToDuration(-5, 0)).toBe(0);
    expect(clampToDuration(1_500, 0)).toBe(1_500);
  });
});
