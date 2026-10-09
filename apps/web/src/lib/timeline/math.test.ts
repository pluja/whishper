import { describe, expect, it } from "vitest";

import {
  cueIsValid,
  neighbourBounds,
  pxToTime,
  scrollLeftCentredOn,
  scrollLeftRevealing,
  timeToPx,
  timingAfterDelta,
} from "./math";

const cues = [
  { id: "a", start_us: 1_000_000, end_us: 2_000_000 },
  { id: "b", start_us: 3_000_000, end_us: 4_000_000 },
  { id: "c", start_us: 6_000_000, end_us: 7_000_000 },
];
const DURATION_US = 10_000_000;
const OPEN = { minUs: 0, maxUs: DURATION_US };

describe("neighbourBounds", () => {
  it("limits a cue to the gap between its neighbours", () => {
    expect(neighbourBounds(cues, 1, DURATION_US)).toEqual({
      minUs: 2_000_000,
      maxUs: 6_000_000,
    });
  });

  it("uses the timeline edges for the first and last cue", () => {
    expect(neighbourBounds(cues, 0, DURATION_US).minUs).toBe(0);
    expect(neighbourBounds(cues, 2, DURATION_US).maxUs).toBe(DURATION_US);
  });

  it("never pulls an already overlapping cue inward", () => {
    const overlapping = [
      { id: "a", start_us: 0, end_us: 3_500_000 },
      { id: "b", start_us: 3_000_000, end_us: 5_000_000 },
      { id: "c", start_us: 4_500_000, end_us: 6_000_000 },
    ];
    expect(neighbourBounds(overlapping, 1, DURATION_US)).toEqual({
      minUs: 3_000_000,
      maxUs: 5_000_000,
    });
  });
});

describe("timingAfterDelta", () => {
  const cue = cues[1];
  const bounds = neighbourBounds(cues, 1, DURATION_US);

  it("moves a whole cue and keeps its duration", () => {
    expect(timingAfterDelta(cue, "whole", 500_000, bounds)).toEqual({
      id: "b",
      start_us: 3_500_000,
      end_us: 4_500_000,
    });
  });

  it("stops a whole-cue drag at the neighbours", () => {
    expect(timingAfterDelta(cue, "whole", -5_000_000, bounds).start_us).toBe(
      2_000_000,
    );
    expect(timingAfterDelta(cue, "whole", 5_000_000, bounds).end_us).toBe(
      6_000_000,
    );
  });

  it("passes neighbours with open bounds but stays on the timeline", () => {
    expect(timingAfterDelta(cue, "whole", 2_500_000, OPEN)).toEqual({
      id: "b",
      start_us: 5_500_000,
      end_us: 6_500_000,
    });
    expect(timingAfterDelta(cue, "whole", 50_000_000, OPEN).end_us).toBe(
      DURATION_US,
    );
  });

  it("limits handles to the neighbour and the opposite edge", () => {
    expect(timingAfterDelta(cue, "start", -9_000_000, bounds).start_us).toBe(
      2_000_000,
    );
    expect(timingAfterDelta(cue, "start", 9_000_000, bounds).start_us).toBe(
      4_000_000,
    );
    expect(timingAfterDelta(cue, "end", 9_000_000, bounds).end_us).toBe(
      6_000_000,
    );
    expect(timingAfterDelta(cue, "end", -9_000_000, bounds).end_us).toBe(
      3_000_000,
    );
  });
});

describe("cueIsValid", () => {
  it("rejects cues outside the timeline or inverted", () => {
    expect(cueIsValid(cues[0], DURATION_US)).toBe(true);
    expect(cueIsValid({ id: "x", start_us: 5, end_us: 4 }, DURATION_US)).toBe(
      false,
    );
    expect(
      cueIsValid(
        { id: "x", start_us: 0, end_us: DURATION_US + 1 },
        DURATION_US,
      ),
    ).toBe(false);
    expect(cueIsValid({ id: "x", start_us: 0.5, end_us: 1 }, DURATION_US)).toBe(
      false,
    );
  });
});

describe("pixel conversion", () => {
  it("maps time to pixels and back", () => {
    expect(timeToPx(2_500_000, DURATION_US, 1_000)).toBe(250);
    expect(pxToTime(250, DURATION_US, 1_000)).toBe(2_500_000);
    expect(timeToPx(1, 0, 1_000)).toBe(0);
    expect(pxToTime(1, DURATION_US, 0)).toBe(0);
  });
});

describe("scroll targets", () => {
  const geometry = {
    durationUs: DURATION_US,
    contentWidthPx: 4_000,
    viewportWidthPx: 1_000,
  };

  it("centres a time and clamps to the scrollable range", () => {
    expect(scrollLeftCentredOn(5_000_000, geometry)).toBe(1_500);
    expect(scrollLeftCentredOn(0, geometry)).toBe(0);
    expect(scrollLeftCentredOn(DURATION_US, geometry)).toBe(3_000);
  });

  it("leaves the view alone while the playhead is visible", () => {
    expect(scrollLeftRevealing(2_000_000, 500, 5, geometry)).toBe(500);
  });

  it("pages just enough to keep the playhead inside the gutter", () => {
    expect(scrollLeftRevealing(4_000_000, 500, 5, geometry)).toBe(605);
    expect(scrollLeftRevealing(1_000_000, 500, 5, geometry)).toBe(395);
  });
});
