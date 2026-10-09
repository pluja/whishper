<script module lang="ts">
  export type LoadState = "idle" | "loading" | "ready" | "failed";

  export type ProbeState =
    "not_started" | "queued" | "running" | "completed" | "failed";
</script>

<script lang="ts">
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
    <div class="timeline-state failure" role="alert">
      <strong>Waveform unavailable</strong>
      <span>{timelineStatus.message}</span>
    </div>
  {:else}
    <div class="timeline-state" data-kind={timelineStatus.kind} role="status">
      {#if timelineStatus.kind === "preparing"}<span class="state-pulse"
        ></span>{/if}
      <span>{timelineStatus.message}</span>
    </div>
  {/if}
{/if}

<style>
  .timeline-state {
    position: absolute;
    z-index: 7;
    left: 50%;
    bottom: 39px;
    display: flex;
    width: max-content;
    max-width: min(26rem, calc(100% - 2rem));
    min-height: 1.75rem;
    align-items: center;
    gap: 0.45rem;
    translate: -50% 0;
    border: 1px solid var(--waveform-border);
    border-radius: 0.3rem;
    padding: 0.28rem 0.6rem;
    background: color-mix(in srgb, var(--waveform-raised) 94%, transparent);
    color: var(--waveform-muted);
    font-size: 0.625rem;
    pointer-events: none;
  }

  .timeline-state.failure {
    display: grid;
    gap: 0.05rem;
    border-color: rgb(255 126 139 / 0.32);
    background: rgb(57 35 40 / 0.96);
    color: #ffc1c7;
  }

  .timeline-state.failure strong {
    font-size: 0.625rem;
  }

  .state-pulse {
    width: 0.4rem;
    height: 0.4rem;
    flex: none;
    border-radius: 50%;
    background: var(--waveform-accent);
    box-shadow: 0 0 0 0
      color-mix(in srgb, var(--waveform-accent) 40%, transparent);
    animation: waveform-pulse 1.5s ease-out infinite;
  }

  @keyframes waveform-pulse {
    70%,
    100% {
      box-shadow: 0 0 0 5px transparent;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .state-pulse {
      animation: none;
    }
  }
</style>
