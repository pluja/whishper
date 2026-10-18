import { describe, expect, it } from "vitest";
import {
  eraseBackward,
  eraseForward,
  overtype,
  parsePastedTimecode,
  stepTimecode,
  TIMECODE_MAX_US,
} from "./timecode";

const ZERO = "00:00:00.000";
const FULL = "12:34:56.789";
const SECOND = 1_000_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

describe("overtype", () => {
  it("overwrites the digit under the caret and advances", () => {
    expect(overtype(ZERO, 0, "1")).toEqual({ text: "10:00:00.000", caret: 1 });
    expect(overtype(ZERO, 9, "5")).toEqual({ text: "00:00:00.500", caret: 10 });
  });

  it("skips separators before and after the typed digit", () => {
    expect(overtype(ZERO, 1, "2")).toEqual({ text: "02:00:00.000", caret: 3 });
    expect(overtype(ZERO, 2, "4")).toEqual({ text: "00:40:00.000", caret: 4 });
    expect(overtype(ZERO, 8, "7")).toEqual({ text: "00:00:00.700", caret: 10 });
  });

  it("does nothing at the end of the field", () => {
    expect(overtype(FULL, 12, "5")).toBeNull();
    expect(overtype(ZERO, 11, "5")).toEqual({
      text: "00:00:00.005",
      caret: 12,
    });
  });

  it("rejects a minutes or seconds tens digit above 5", () => {
    expect(overtype(ZERO, 3, "6")).toBeNull();
    expect(overtype(ZERO, 6, "9")).toBeNull();
    expect(overtype(ZERO, 2, "6")).toBeNull();
    expect(overtype(ZERO, 3, "5")).toEqual({ text: "00:50:00.000", caret: 4 });
    expect(overtype(ZERO, 4, "9")).toEqual({ text: "00:09:00.000", caret: 6 });
    expect(overtype(ZERO, 0, "9")).toEqual({ text: "90:00:00.000", caret: 1 });
  });

  it("ignores characters that are not digits", () => {
    expect(overtype(ZERO, 0, "a")).toBeNull();
    expect(overtype(ZERO, 0, ":")).toBeNull();
    expect(overtype(ZERO, 0, " ")).toBeNull();
  });

  it("types several digits in a row and skips the others", () => {
    expect(overtype(ZERO, 0, "1a2")).toEqual({
      text: "12:00:00.000",
      caret: 3,
    });
    expect(overtype(ZERO, 3, "61")).toEqual({
      text: "00:10:00.000",
      caret: 4,
    });
  });
});

describe("eraseBackward", () => {
  it("zeroes the digit before the caret and moves onto it", () => {
    expect(eraseBackward(FULL, 3, 3)).toEqual({
      text: "10:34:56.789",
      caret: 1,
    });
    expect(eraseBackward(FULL, 12, 12)).toEqual({
      text: "12:34:56.780",
      caret: 11,
    });
    expect(eraseBackward(FULL, 10, 10)).toEqual({
      text: "12:34:56.089",
      caret: 9,
    });
  });

  it("does nothing at the start of the field", () => {
    expect(eraseBackward(FULL, 0, 0)).toEqual({ text: FULL, caret: 0 });
  });

  it("zeroes every selected digit and keeps the separators", () => {
    expect(eraseBackward(FULL, 3, 8)).toEqual({
      text: "12:00:00.789",
      caret: 3,
    });
    expect(eraseBackward(FULL, 0, 12)).toEqual({ text: ZERO, caret: 0 });
  });
});

describe("eraseForward", () => {
  it("zeroes the digit after the caret and moves past it", () => {
    expect(eraseForward(FULL, 2, 2)).toEqual({
      text: "12:04:56.789",
      caret: 4,
    });
    expect(eraseForward(FULL, 4, 4)).toEqual({
      text: "12:30:56.789",
      caret: 6,
    });
  });

  it("does nothing at the end of the field", () => {
    expect(eraseForward(FULL, 12, 12)).toEqual({ text: FULL, caret: 12 });
  });

  it("zeroes every selected digit", () => {
    expect(eraseForward(FULL, 9, 12)).toEqual({
      text: "12:34:56.000",
      caret: 9,
    });
  });
});

describe("stepTimecode", () => {
  const start = HOUR + 2 * MINUTE + 3 * SECOND + 456_000;

  it("steps the segment under the caret", () => {
    expect(stepTimecode(start, 0, 1, false)).toBe(start + HOUR);
    expect(stepTimecode(start, 2, -1, false)).toBe(start - HOUR);
    expect(stepTimecode(start, 3, 1, false)).toBe(start + MINUTE);
    expect(stepTimecode(start, 5, 1, false)).toBe(start + MINUTE);
    expect(stepTimecode(start, 6, -1, false)).toBe(start - SECOND);
    expect(stepTimecode(start, 9, 1, false)).toBe(start + 1_000);
    expect(stepTimecode(start, 12, -1, false)).toBe(start - 1_000);
  });

  it("multiplies the step by ten when large", () => {
    expect(stepTimecode(start, 6, 1, true)).toBe(start + 10 * SECOND);
    expect(stepTimecode(start, 11, 1, true)).toBe(start + 10_000);
  });

  it("carries into the next segment", () => {
    expect(stepTimecode(59 * SECOND + 999_000, 10, 1, false)).toBe(MINUTE);
    expect(stepTimecode(59 * MINUTE + 55 * SECOND, 6, 1, true)).toBe(
      HOUR + 5 * SECOND,
    );
    expect(stepTimecode(MINUTE, 7, -1, false)).toBe(59 * SECOND);
  });

  it("clamps at zero and at the largest time the field can show", () => {
    expect(stepTimecode(500_000, 7, -1, false)).toBe(0);
    expect(stepTimecode(30 * MINUTE, 0, -1, false)).toBe(0);
    expect(stepTimecode(TIMECODE_MAX_US - 1_000, 0, 1, false)).toBe(
      TIMECODE_MAX_US,
    );
    expect(TIMECODE_MAX_US).toBe(99 * HOUR + 59 * MINUTE + 59_999_000);
  });

  it("drops sub-millisecond precision so the value matches the field", () => {
    expect(stepTimecode(SECOND + 400, 9, 1, false)).toBe(SECOND + 1_000);
  });
});

describe("parsePastedTimecode", () => {
  it("parses loose forms", () => {
    expect(parsePastedTimecode("1:02.5")).toBe(62_500_000);
    expect(parsePastedTimecode("62.5")).toBe(62_500_000);
    expect(parsePastedTimecode("00:01:02,500")).toBe(62_500_000);
    expect(parsePastedTimecode("1:02:03")).toBe(3_723_000_000);
    expect(parsePastedTimecode("27")).toBe(27_000_000);
  });

  it("rejects text that is not a time or does not fit the field", () => {
    expect(parsePastedTimecode("soon")).toBeNull();
    expect(parsePastedTimecode("1:75")).toBeNull();
    expect(parsePastedTimecode("100:00:00")).toBeNull();
  });
});
