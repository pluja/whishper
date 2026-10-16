<script lang="ts">
  import TimelineCue from "./TimelineCue.svelte";
  import TimelineStatus from "./TimelineStatus.svelte";
  import TimelineToolbar from "./TimelineToolbar.svelte";
  import { drawTimeline, TRACK_HEIGHT } from "./draw";
  import {
    clampInteger,
    neighbourBounds,
    timeToPx,
    type CueTiming,
    type TimingGesture,
  } from "./math";
  import type { ProbeState } from "./types";
  import { MAX_ZOOM, TimelineViewport } from "./viewport.svelte";
  import { chooseWaveformLevel, waveformMatchesDuration } from "./waveform";
  import { WaveformLoader } from "./waveform-loader.svelte";

  type Props = {
    durationUs: number;
    probeState: ProbeState;
    waveformUrl: string | null;
    cues: readonly (CueTiming & { text: string })[];
    selectedCueId: string | null;
    playbackUs: number;
    playing: boolean;
    seekRevision: number;
    onseek: (us: number) => void;
    onselect: (cueId: string) => void;
    oncommittiming: (timing: CueTiming, gesture: TimingGesture) => void;
  };

  let {
    durationUs,
    probeState,
    waveformUrl,
    cues,
    selectedCueId,
    playbackUs,
    playing,
    seekRevision,
    onseek,
    onselect,
    oncommittiming,
  }: Props = $props();

  const uid = $props.id();

  let root = $state<HTMLElement>();
  let canvas = $state<HTMLCanvasElement>();
  const loader = new WaveformLoader();
  let timelineDurationUs = $derived(
    Number.isSafeInteger(durationUs) && durationUs > 0 ? durationUs : 0,
  );
  const viewport = new TimelineViewport({
    durationUs: () => timelineDurationUs,
    playbackUs: () => playbackUs,
    playing: () => playing,
    seekRevision: () => seekRevision,
    seek: (microseconds) => onseek(microseconds),
  });

  let waveformMismatch = $derived(
    loader.waveform !== null &&
      timelineDurationUs > 0 &&
      !waveformMatchesDuration(loader.waveform, timelineDurationUs),
  );
  let selectedLevel = $derived(
    waveformMismatch || timelineDurationUs <= 0
      ? null
      : chooseWaveformLevel(
          loader.waveform,
          (viewport.contentWidthPx * 1_000_000) / timelineDurationUs,
        ),
  );
  $effect(() => loader.load(waveformUrl));

  $effect(() => {
    if (!canvas || !root || viewport.width <= 0) return;
    drawTimeline({
      canvas,
      themeSource: root,
      viewportWidthPx: viewport.width,
      scrollLeft: viewport.scrollLeft,
      durationUs: timelineDurationUs,
      contentWidthPx: viewport.contentWidthPx,
      level: selectedLevel,
    });
  });
</script>

<section
  class="studio-waveform"
  bind:this={root}
  aria-label="Waveform timeline"
>
  <TimelineToolbar
    {playbackUs}
    zoom={viewport.zoom}
    maxZoom={MAX_ZOOM}
    onzoom={viewport.setZoom}
  />

  <p id={`${uid}-instructions`} class="visually-hidden">
    Click the timeline to seek. Drag empty space to pan. While zoomed, use the
    mouse wheel or trackpad to pan horizontally. Dragging a cue stops at its
    neighbours; hold Alt to drag past them. Focus a cue or one of its boundary
    handles and use Left or Right Arrow to adjust it by one millisecond, or
    Shift with an arrow for 100 milliseconds. Press Escape to cancel a pointer
    drag.
  </p>

  <div class="timeline-stage">
    <div
      class="timeline-viewport"
      class:panning={viewport.panning}
      bind:this={viewport.element}
      bind:clientWidth={viewport.width}
      role="region"
      aria-label="Scrollable waveform and subtitle cues"
      aria-describedby={`${uid}-instructions`}
      onscroll={viewport.handleScroll}
      onwheel={viewport.handleWheel}
      onpointerdown={viewport.beginPan}
      onpointermove={viewport.movePan}
      onpointerup={viewport.finishPan}
      onpointercancel={viewport.cancelPan}
      onlostpointercapture={viewport.cancelPan}
    >
      <div
        class="timeline-content"
        style:width={`${viewport.contentWidthPx}px`}
      >
        <canvas
          class="timeline-canvas"
          bind:this={canvas}
          style:width={`${Math.max(1, viewport.width)}px`}
          style:height={`${TRACK_HEIGHT}px`}
          aria-hidden="true"
        ></canvas>

        {#each cues as cue, cueIndex (cue.id)}
          <TimelineCue
            {cue}
            number={cueIndex + 1}
            selected={cue.id === selectedCueId}
            durationUs={timelineDurationUs}
            contentWidthPx={viewport.contentWidthPx}
            neighbourBounds={neighbourBounds(
              cues,
              cueIndex,
              timelineDurationUs,
            )}
            {onselect}
            ondragstart={viewport.cancelPan}
            {oncommittiming}
          />
        {/each}

        {#if timelineDurationUs > 0}
          <div
            class="playhead"
            style:left={`${timeToPx(clampInteger(playbackUs, 0, timelineDurationUs), timelineDurationUs, viewport.contentWidthPx)}px`}
            aria-hidden="true"
          >
            <span></span>
          </div>
        {/if}
      </div>
    </div>

    <TimelineStatus
      loadState={loader.state}
      loadError={loader.error}
      {probeState}
      hasWaveform={loader.waveform !== null}
      durationMismatch={waveformMismatch}
    />
  </div>
</section>

<style>
  .studio-waveform {
    --waveform-bg: var(--studio-panel, #1c1f24);
    --waveform-track: var(--studio-bg, #15171b);
    --waveform-raised: var(--studio-panel-raised, #22262c);
    --waveform-hover: var(--studio-panel-hover, #272b32);
    --waveform-border: var(--studio-border, #343940);
    --waveform-border-soft: var(--studio-border-soft, #292d33);
    --waveform-text: var(--studio-text, #e6e8ec);
    --waveform-text-soft: var(--studio-text-soft, #bec3cb);
    --waveform-muted: var(--studio-muted, #858c97);
    --waveform-accent: var(--studio-accent, #8b83ff);
    --studio-waveform: color-mix(in srgb, var(--waveform-accent) 76%, #a7b2c4);
    display: grid;
    min-width: 0;
    height: min(11.25rem, 24dvh);
    min-height: 10.5rem;
    grid-template-rows: 2.25rem minmax(0, 1fr);
    overflow: hidden;
    border-block: 1px solid var(--waveform-border);
    background: var(--waveform-bg);
    color: var(--waveform-text);
    font-family: var(--font-body, ui-sans-serif, system-ui, sans-serif);
  }

  .timeline-viewport {
    position: relative;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow-x: auto;
    overflow-y: hidden;
    background: var(--waveform-track);
    cursor: crosshair;
    overscroll-behavior-inline: contain;
    scrollbar-color: #505661 #17191d;
    scrollbar-width: thin;
  }
  .timeline-stage {
    position: relative;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .timeline-viewport.panning {
    cursor: grabbing;
    user-select: none;
  }

  .timeline-content {
    position: relative;
    height: 124px;
    min-width: 100%;
    touch-action: none;
  }

  .timeline-canvas {
    position: sticky;
    left: 0;
    display: block;
    max-width: none;
    pointer-events: none;
  }

  .playhead {
    position: absolute;
    z-index: 6;
    top: 0;
    bottom: 0;
    width: 1px;
    background: #ff8a92;
    pointer-events: none;
  }

  .playhead span {
    position: absolute;
    top: 0;
    left: -4px;
    width: 9px;
    height: 7px;
    background: #ff8a92;
    clip-path: polygon(0 0, 100% 0, 50% 100%);
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (max-width: 42rem) {
    .studio-waveform {
      height: 10.5rem;
    }
  }
</style>
