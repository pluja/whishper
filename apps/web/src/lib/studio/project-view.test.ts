import { describe, expect, it } from "vitest";

import { derivativeUrl, editorCues, isEditingLocked } from "./project-view";
import type { StudioData } from "$lib/shared/studio-data";

describe("editorCues", () => {
  it("maps stored cues to editor cues", () => {
    expect(
      editorCues([
        { id: "a", position: 0, startUs: 1, endUs: 2, text: "Hi", words: [] },
      ]),
    ).toEqual([{ id: "a", position: 0, start_us: 1, end_us: 2, text: "Hi" }]);
  });
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

describe("isEditingLocked", () => {
  const track = { id: "track" };

  it("locks an existing track while a new transcription is queued or running", () => {
    expect(isEditingLocked(track, { status: "queued" })).toBe(true);
    expect(isEditingLocked(track, { status: "running" })).toBe(true);
  });

  it("keeps the track editable once the run has finished or failed", () => {
    expect(isEditingLocked(track, { status: "completed" })).toBe(false);
    expect(isEditingLocked(track, { status: "failed" })).toBe(false);
    expect(isEditingLocked(track, null)).toBe(false);
  });

  it("has nothing to lock before the first track exists", () => {
    expect(isEditingLocked(null, { status: "running" })).toBe(false);
  });
});
