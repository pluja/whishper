import { describe, expect, it } from "vitest";

import { rulerLabel, rulerStepUs } from "./draw";

describe("rulerStepUs", () => {
  it("rounds up to the next 1, 2 or 5 step", () => {
    expect(rulerStepUs(300_000)).toBe(500_000);
    expect(rulerStepUs(1_500_000)).toBe(2_000_000);
    expect(rulerStepUs(7_000_000)).toBe(10_000_000);
  });

  it("never steps by less than a millisecond", () => {
    expect(rulerStepUs(200)).toBe(1_000);
    expect(rulerStepUs(Number.NaN)).toBe(1_000);
  });
});

describe("rulerLabel", () => {
  function labels(firstUs: number, stepUs: number, count: number): string[] {
    return Array.from({ length: count }, (_, index) =>
      rulerLabel(firstUs + index * stepUs, stepUs),
    );
  }

  it("shows whole seconds for steps of a second or more", () => {
    expect(labels(60_000_000, 2_000_000, 2)).toEqual(["1:00", "1:02"]);
  });

  it("gives every sub-second tick its own label", () => {
    expect(labels(1_000_000, 500_000, 3)).toEqual([
      "0:01.0",
      "0:01.5",
      "0:02.0",
    ]);
    expect(labels(1_000_000, 50_000, 2)).toEqual(["0:01.00", "0:01.05"]);
    expect(labels(3_600_000_000, 1_000, 2)).toEqual([
      "1:00:00.000",
      "1:00:00.001",
    ]);
  });
});
