import { describe, expect, it } from "vitest";

import {
  formatEditorTime,
  parseEditorTime,
  renderSrt,
  renderWebVtt,
} from "$lib/subtitles";

const cues = [
  {
    id: "b14d765a-0cb2-4fa8-af80-c563ab57c959",
    position: 0,
    startUs: 3_723_456_789,
    endUs: 3_725_000_000,
    text: "A subtitle.",
  },
];

describe("subtitle timecodes", () => {
  it("round-trips editor timecodes", () => {
    expect(formatEditorTime(3_723_456_789)).toBe("01:02:03.456");
    expect(formatEditorTime(-1)).toBe("00:00:00.000");
    expect(parseEditorTime("01:02:03.456")).toBe(3_723_456_000);
    expect(parseEditorTime("02:03,5")).toBe(123_500_000);
    expect(parseEditorTime("00:61.000")).toBeNull();
  });
});

describe("subtitle exports", () => {
  it("renders SRT with comma millisecond separators", () => {
    expect(renderSrt(cues)).toBe(
      "1\n01:02:03,456 --> 01:02:05,000\nA subtitle.\n",
    );
  });

  it("renders WebVTT with a header and period separators", () => {
    expect(renderWebVtt(cues)).toBe(
      "WEBVTT\n\n01:02:03.456 --> 01:02:05.000\nA subtitle.\n",
    );
  });
});
