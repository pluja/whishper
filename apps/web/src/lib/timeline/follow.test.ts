import { describe, expect, it } from "vitest";

import { decideFollow, zoomAnchorUs, type FollowContext } from "./follow";

const playing: FollowContext = {
  following: true,
  playing: true,
  panning: false,
};
const paused: FollowContext = { ...playing, playing: false };
const suspended: FollowContext = { ...playing, following: false };

describe("decideFollow", () => {
  it("follows playback progress while playing", () => {
    expect(decideFollow("progress", playing)).toEqual({
      following: true,
      reveal: true,
    });
  });

  it("does not move the view for progress while paused or panning", () => {
    expect(decideFollow("progress", paused).reveal).toBe(false);
    expect(decideFollow("progress", { ...playing, panning: true }).reveal).toBe(
      false,
    );
  });

  it("reveals an explicit seek while paused", () => {
    expect(decideFollow("seek", { ...paused, following: false })).toEqual({
      following: true,
      reveal: true,
    });
  });

  it("suspends following after a manual pan until the next play", () => {
    const afterPan = decideFollow("manual-scroll", playing);
    expect(afterPan).toEqual({ following: false, reveal: false });
    expect(decideFollow("progress", suspended).reveal).toBe(false);
    expect(decideFollow("play", suspended)).toEqual({
      following: true,
      reveal: false,
    });
  });

  it("resumes following on an explicit seek during playback", () => {
    expect(decideFollow("seek", suspended)).toEqual({
      following: true,
      reveal: true,
    });
  });
});

describe("zoomAnchorUs", () => {
  it("keeps the view centre while paused", () => {
    expect(zoomAnchorUs(5_000_000, 0, paused)).toBe(5_000_000);
  });

  it("keeps the view centre while following is suspended", () => {
    expect(zoomAnchorUs(5_000_000, 1_000_000, suspended)).toBe(5_000_000);
  });

  it("centres on the playhead while following playback", () => {
    expect(zoomAnchorUs(5_000_000, 1_000_000, playing)).toBe(1_000_000);
  });
});
