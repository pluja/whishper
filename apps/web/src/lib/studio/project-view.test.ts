import { describe, expect, it } from "vitest";

import {
  derivativeUrl,
  editorCues,
  isAudioSource,
  knownDurationUs,
} from "./project-view";
import type { StudioData } from "./types";

describe("editorCues", () => {
  it("maps stored cues to editor cues", () => {
    expect(
      editorCues([
        { id: "a", position: 0, startUs: 1, endUs: 2, text: "Hi", words: [] },
      ]),
    ).toEqual([{ id: "a", position: 0, start_us: 1, end_us: 2, text: "Hi" }]);
  });
});

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

describe("derivativeUrl", () => {
  const derivatives = [
    {
      kind: "waveform",
      mediaType: "application/octet-stream",
      sizeBytes: 1,
      metadata: {},
      url: "/waveform",
    },
  ] satisfies StudioData["derivatives"];

  it("finds the url of a ready derivative", () => {
    expect(derivativeUrl(derivatives, "waveform")).toBe("/waveform");
  });

  it("is null when the derivative is missing", () => {
    expect(derivativeUrl(derivatives, "proxy")).toBeNull();
  });
});

describe("isAudioSource", () => {
  it("trusts an audio media type", () => {
    expect(
      isAudioSource({ mediaType: "audio/mpeg", mediaFilename: "clip.mp4" }),
    ).toBe(true);
  });

  it("falls back to the filename extension", () => {
    expect(isAudioSource({ mediaType: null, mediaFilename: "talk.FLAC" })).toBe(
      true,
    );
    expect(
      isAudioSource({ mediaType: "video/mp4", mediaFilename: "film.mp4" }),
    ).toBe(false);
    expect(isAudioSource({ mediaType: null, mediaFilename: null })).toBe(false);
  });
});
