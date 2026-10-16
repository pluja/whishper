import { describe, expect, it } from "vitest";

import {
  formatEditorTime,
  parseEditorTime,
  renderSrt,
  renderWebVtt,
} from "$lib/shared/subtitles";

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

  it("collapses blank lines inside a cue so it cannot split into two", () => {
    const blankLines = [{ ...cues[0], text: "First\n\n \r\nSecond" }];

    expect(renderSrt(blankLines)).toBe(
      "1\n01:02:03,456 --> 01:02:05,000\nFirst\nSecond\n",
    );
    expect(renderWebVtt(blankLines)).toBe(
      "WEBVTT\n\n01:02:03.456 --> 01:02:05.000\nFirst\nSecond\n",
    );
  });

  it("escapes the WebVTT cue timing arrow in cue text", () => {
    const injected = [{ ...cues[0], text: "a --> b\n00:00.000 --> 00:01.000" }];

    expect(renderWebVtt(injected)).toBe(
      "WEBVTT\n\n01:02:03.456 --> 01:02:05.000\na --&gt; b\n00:00.000 --&gt; 00:01.000\n",
    );
  });

  it("escapes markup characters in WebVTT cue text", () => {
    const markup = [{ ...cues[0], text: "Fish & <i>chips</i>" }];

    expect(renderWebVtt(markup)).toBe(
      "WEBVTT\n\n01:02:03.456 --> 01:02:05.000\nFish &amp; &lt;i&gt;chips&lt;/i&gt;\n",
    );
  });

  it("neutralizes the timing arrow in SRT cue text", () => {
    const injected = [{ ...cues[0], text: "a --> b" }];

    expect(renderSrt(injected)).toBe(
      "1\n01:02:03,456 --> 01:02:05,000\na -> b\n",
    );
  });
});
