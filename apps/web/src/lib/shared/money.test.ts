import { describe, expect, it } from "vitest";

import {
  formatUsd,
  parseUsdMicros,
  priceForDuration,
} from "#lib/shared/money.ts";

describe("formatUsd", () => {
  it.each([
    [0, "$0.00"],
    [6_000, "$0.006"],
    [666, "$0.00067"],
    [120_000, "$0.12"],
    [1_234_567, "$1.23"],
  ])("formats %i millionths as %s", (micros, text) => {
    expect(formatUsd(micros)).toBe(text);
  });
});

describe("parseUsdMicros", () => {
  it("reads dollars with or without a sign", () => {
    expect(parseUsdMicros("0.006")).toBe(6_000);
    expect(parseUsdMicros(" $1.5 ")).toBe(1_500_000);
    expect(parseUsdMicros("")).toBeNull();
    expect(parseUsdMicros("1e3")).toBeUndefined();
  });
});

describe("priceForDuration", () => {
  it("charges by the second", () => {
    expect(priceForDuration(6_000, 90_000_000)).toBe(9_000);
  });
});
