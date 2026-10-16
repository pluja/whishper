import { describe, expect, it } from "vitest";

import { isAudioMedia } from "./media";

describe("isAudioMedia", () => {
  it("trusts an audio media type", () => {
    expect(isAudioMedia("audio/mpeg", "clip.mp4")).toBe(true);
  });

  it("falls back to the filename extension", () => {
    expect(isAudioMedia(null, "talk.FLAC")).toBe(true);
    expect(isAudioMedia("video/mp4", "film.mp4")).toBe(false);
    expect(isAudioMedia(null, null)).toBe(false);
  });
});
