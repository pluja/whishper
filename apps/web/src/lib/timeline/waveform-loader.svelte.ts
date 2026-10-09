import { loadWaveform, type DecodedWaveform } from "./waveform";

export type LoadState = "idle" | "loading" | "ready" | "failed";

export class WaveformLoader {
  waveform = $state.raw<DecodedWaveform | null>(null);
  state = $state<LoadState>("idle");
  error = $state("");

  // Returns the abort for an effect teardown, so a newer URL always wins.
  load(url: string | null): () => void {
    const controller = new AbortController();
    this.waveform = null;
    this.error = "";
    if (!url) {
      this.state = "idle";
      return () => controller.abort();
    }

    this.state = "loading";
    loadWaveform(url, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        this.waveform = value;
        this.state = "ready";
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        this.state = "failed";
        this.error =
          cause instanceof Error && cause.message.startsWith("Waveform")
            ? cause.message
            : "Waveform data is invalid or unavailable.";
      });

    return () => controller.abort();
  }
}
