import { describe, expect, it } from "vitest";

import { isAcceptedMediaType, isAudioMedia, normalizeMediaType } from "./media";

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

describe("media type sanitizing", () => {
  it("accepts only audio and video types", () => {
    expect(normalizeMediaType("video/mp4")).toBe("video/mp4");
    expect(normalizeMediaType("Audio/Ogg; codecs=opus")).toBe("audio/ogg");
    expect(normalizeMediaType("application/ogg")).toBe("application/ogg");
    expect(normalizeMediaType("application/mp4")).toBe("application/mp4");
    expect(normalizeMediaType("application/json")).toBeNull();
    expect(normalizeMediaType("text/html")).toBeNull();
    expect(normalizeMediaType("image/svg+xml")).toBeNull();
    expect(normalizeMediaType("video/mp4\r\nX-Evil: 1")).toBeNull();
    expect(normalizeMediaType("")).toBeNull();
    expect(normalizeMediaType(null)).toBeNull();
  });
});

describe("isAcceptedMediaType", () => {
  it("accepts what the upload server accepts", () => {
    expect(isAcceptedMediaType("video/webm")).toBe(true);
    expect(isAcceptedMediaType("application/ogg")).toBe(true);
    expect(isAcceptedMediaType("")).toBe(true);
    expect(isAcceptedMediaType("application/pdf")).toBe(false);
    expect(isAcceptedMediaType("image/png")).toBe(false);
  });
});
