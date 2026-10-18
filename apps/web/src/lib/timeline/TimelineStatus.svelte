<script lang="ts">
  import type { ProbeState } from "$lib/shared/project-status";
  import type { LoadState } from "./waveform-loader.svelte";

  type Props = {
    loadState: LoadState;
    loadError: string;
    probeState: ProbeState;
    hasWaveform: boolean;
    durationMismatch: boolean;
  };

  let {
    loadState,
    loadError,
    probeState,
    hasWaveform,
    durationMismatch,
  }: Props = $props();

  const STATE_CLASSES =
    "pointer-events-none absolute bottom-[39px] left-1/2 z-7 w-max max-w-[min(26rem,calc(100%-2rem))] min-h-7 -translate-x-1/2 rounded-md border px-2.5 py-1 text-xs";

  let timelineStatus = $derived.by(() => {
    if (loadState === "loading") {
      return { kind: "preparing", message: "Loading waveform…" } as const;
    }
    if (loadState === "failed") {
      return {
        kind: "failure",
        message: loadError || "Waveform data could not be loaded.",
      } as const;
    }
    if (durationMismatch) {
      return {
        kind: "failure",
        message: "Waveform duration does not match the timeline.",
      } as const;
    }
    if (hasWaveform) return null;
    if (probeState === "queued" || probeState === "running") {
      return {
        kind: "preparing",
        message:
          probeState === "queued"
            ? "Waveform preparation is queued."
            : "Preparing waveform…",
      } as const;
    }
    if (probeState === "failed") {
      return {
        kind: "failure",
        message: "Waveform preparation failed.",
      } as const;
    }
    return {
      kind: "empty",
      message:
        probeState === "completed"
          ? "No waveform is available for this source."
          : "Waveform has not been prepared.",
    } as const;
  });
</script>

{#if timelineStatus}
  {#if timelineStatus.kind === "failure"}
    <div
      class="{STATE_CLASSES} grid gap-0.5 border-danger/40 bg-danger-soft text-danger"
      role="alert"
    >
      <strong>Waveform unavailable</strong>
      <span>{timelineStatus.message}</span>
    </div>
  {:else}
    <div
      class="{STATE_CLASSES} flex items-center gap-2 border-border bg-surface-raised/95 text-text-muted"
      role="status"
    >
      {#if timelineStatus.kind === "preparing"}
        <span
          class="size-1.5 flex-none animate-pulse-ring rounded-full bg-accent motion-reduce:animate-none"
        ></span>
      {/if}
      <span>{timelineStatus.message}</span>
    </div>
  {/if}
{/if}
