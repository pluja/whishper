import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Transport } from "./transport.svelte";

function fakeMedia(paused: boolean) {
  return {
    paused,
    currentTime: 5,
    duration: 10,
    playbackRate: 1,
    pause: vi.fn(),
    play: vi.fn(async () => {}),
  };
}

function newTransport(): Transport {
  return new Transport(
    { cues: [], selectedCueId: null },
    {
      frameDurationUs: () => 40_000,
      preparedDurationUs: () => 10_000_000,
      trackDurationUs: () => 0,
    },
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", globalThis);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Transport.playing", () => {
  it("follows the media element's play and pause events", () => {
    const transport = newTransport();
    expect(transport.playing).toBe(false);

    transport.updatePlayingState({
      currentTarget: fakeMedia(false),
    } as unknown as Event);
    expect(transport.playing).toBe(true);

    transport.updatePlayingState({
      currentTarget: fakeMedia(true),
    } as unknown as Event);
    expect(transport.playing).toBe(false);
  });

  it("counts reverse shuttling as playback", () => {
    const transport = newTransport();
    transport.mediaElement = fakeMedia(true) as unknown as HTMLMediaElement;

    transport.startReverseShuttle();
    expect(transport.playing).toBe(true);

    transport.resetShuttleRate();
    expect(transport.playing).toBe(false);
  });
});
