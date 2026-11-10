import { afterEach, describe, expect, it, vi } from "vitest";

import { WaveformLoader } from "./waveform-loader.svelte";

async function failedLoad(fetchMock: () => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(fetchMock));
  const loader = new WaveformLoader();
  loader.load("/waveform.json");
  await vi.waitFor(() => expect(loader.state).toBe("failed"));
  return loader.error;
}

describe("WaveformLoader", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows what was wrong with the waveform", async () => {
    expect(
      await failedLoad(async () => new Response(null, { status: 404 })),
    ).toBe("Waveform request failed with status 404.");
  });

  it("gives other failures a general message", async () => {
    expect(
      await failedLoad(async () => {
        throw new TypeError("Waveform-shaped network failure");
      }),
    ).toBe("Waveform data is invalid or unavailable.");
  });
});
