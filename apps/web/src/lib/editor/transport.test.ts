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
    {
      cues: [
        {
          id: "a",
          position: 0,
          start_us: 1_000_000,
          end_us: 2_000_000,
          text: "",
        },
        {
          id: "b",
          position: 1,
          start_us: 7_000_000,
          end_us: 8_000_000,
          text: "",
        },
      ],
      selectedCueId: null,
    },
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
  vi.stubGlobal("document", { getElementById: () => null });
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

describe("Transport stopped playback", () => {
  it("clears playing when the media ends without a pause event", () => {
    const transport = newTransport();
    transport.updatePlayingState({
      currentTarget: fakeMedia(false),
    } as unknown as Event);

    transport.markPlaybackStopped();

    expect(transport.playing).toBe(false);
  });
});

describe("Transport.seekRevision", () => {
  it("counts every deliberate playhead jump", () => {
    const transport = newTransport();
    transport.mediaElement = fakeMedia(true) as unknown as HTMLMediaElement;

    transport.seekTo(3_000_000);
    transport.stepFrames(1, 1);
    transport.jumpToCueStart(1);
    transport.goToSourceEdge(false);

    expect(transport.seekRevision).toBe(4);
    expect(transport.playbackUs).toBe(0);
  });

  it("ignores playback progress", () => {
    const transport = newTransport();
    transport.updatePlayback({
      currentTarget: fakeMedia(false),
    } as unknown as Event);
    expect(transport.playbackUs).toBe(5_000_000);
    expect(transport.seekRevision).toBe(0);
  });
});
