import { MEDIA_PREPARATION_VERSION } from "@anysub/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  chooseWaveformLevel,
  decodePeaks,
  loadWaveform,
  validateWaveform,
  waveformMatchesDuration,
} from "./waveform";

function encodePeaks(values: number[]): string {
  return btoa(String.fromCharCode(...values.map((value) => value + 128)));
}

function waveformJson(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: MEDIA_PREPARATION_VERSION,
    encoding: "signed-int8-min-max-base64",
    durationUs: 2_000_000,
    sampleRate: 16_000,
    channelMix: "mono",
    levels: [
      {
        samplesPerPeak: 1_600,
        peaksPerSecond: 10,
        length: 2,
        data: encodePeaks([-10, 20, -128, 127]),
      },
      {
        samplesPerPeak: 160,
        peaksPerSecond: 100,
        length: 1,
        data: encodePeaks([0, 1]),
      },
    ],
    ...overrides,
  };
}

describe("decodePeaks", () => {
  it("decodes offset signed bytes", () => {
    expect([...decodePeaks(encodePeaks([-10, 20, -128, 127]), 2)]).toEqual([
      -10, 20, -128, 127,
    ]);
  });

  it("rejects malformed or mis-sized data", () => {
    expect(() => decodePeaks("", 1)).toThrow("not valid base64");
    expect(() => decodePeaks("ab$=", 1)).toThrow("not valid base64");
    expect(() => decodePeaks(encodePeaks([1, 2]), 2)).toThrow(
      "unexpected length",
    );
  });
});

describe("validateWaveform", () => {
  it("returns decoded levels", () => {
    const waveform = validateWaveform(waveformJson());
    expect(waveform.durationUs).toBe(2_000_000);
    expect(waveform.levels.map((level) => level.peaks.length)).toEqual([4, 2]);
  });

  it("rejects other schema versions and invalid levels", () => {
    expect(() => validateWaveform(waveformJson({ schemaVersion: -1 }))).toThrow(
      "does not match schema",
    );
    expect(() =>
      validateWaveform(waveformJson({ levels: [{ samplesPerPeak: 0 }] })),
    ).toThrow("invalid level");
  });
});

describe("waveformMatchesDuration", () => {
  const waveform = validateWaveform(waveformJson());

  it("accepts durations within 50 ms", () => {
    expect(waveformMatchesDuration(waveform, 2_050_000)).toBe(true);
    expect(waveformMatchesDuration(waveform, 1_950_000)).toBe(true);
  });

  it("rejects durations further apart", () => {
    expect(waveformMatchesDuration(waveform, 2_050_001)).toBe(false);
    expect(waveformMatchesDuration(waveform, 0)).toBe(false);
  });
});

describe("chooseWaveformLevel", () => {
  const waveform = validateWaveform(waveformJson());

  it("picks the level closest to the target density", () => {
    expect(chooseWaveformLevel(waveform, 12)?.peaksPerSecond).toBe(10);
    expect(chooseWaveformLevel(waveform, 80)?.peaksPerSecond).toBe(100);
  });

  it("returns null without a waveform or density", () => {
    expect(chooseWaveformLevel(null, 10)).toBeNull();
    expect(chooseWaveformLevel(waveform, 0)).toBeNull();
  });
});

describe("loadWaveform", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches and validates the waveform", async () => {
    const fetchMock = vi.fn(async () => Response.json(waveformJson()));
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;

    const waveform = await loadWaveform("/waveform.json", signal);

    expect(waveform.levels).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledWith("/waveform.json", {
      signal,
      credentials: "same-origin",
    });
  });

  it("reports failed responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );

    await expect(
      loadWaveform("/waveform.json", new AbortController().signal),
    ).rejects.toThrow("status 404");
  });
});
