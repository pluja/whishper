<script lang="ts">
  import { untrack } from "svelte";
  import { on } from "svelte/events";
  import { THEME_CHANGE_EVENT } from "$lib/shared/theme";
  import TimelineCue from "./TimelineCue.svelte";
  import TimelineStatus from "./TimelineStatus.svelte";
  import TimelineToolbar from "./TimelineToolbar.svelte";
  import { drawTimeline, RULER_FONT, TRACK_HEIGHT } from "./draw";
  import {
    clampInteger,
    neighbourBounds,
    timeToPx,
    type CueTiming,
    type TimingGesture,
  } from "./math";
  import type { ProbeState } from "$lib/shared/project-status";
  import { focusableCueIndex, nextRovingIndex } from "./roving-focus";
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
    editable?: boolean;
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
    editable = true,
    onseek,
    onselect,
    oncommittiming,
  }: Props = $props();

  const uid = $props.id();

  let root = $state<HTMLElement>();
  let canvas = $state<HTMLCanvasElement>();
  const loader = new WaveformLoader();
  const viewport = new TimelineViewport({
    durationUs: () => durationUs,
    playbackUs: () => playbackUs,
    playing: () => playing,
    seekRevision: () => seekRevision,
    seek: (microseconds) => onseek(microseconds),
  });

  let waveformMismatch = $derived(
    loader.waveform !== null &&
      durationUs > 0 &&
      !waveformMatchesDuration(loader.waveform, durationUs),
  );
  let selectedLevel = $derived(
    waveformMismatch || durationUs <= 0
      ? null
      : chooseWaveformLevel(
          loader.waveform,
          (viewport.contentWidthPx * 1_000_000) / durationUs,
        ),
  );
  $effect(() => loader.load(waveformUrl));

  let themeRevision = $state(0);
  $effect(() =>
    on(window, THEME_CHANGE_EVENT, () => {
      themeRevision += 1;
    }),
  );

  // Canvas text does not repaint when a web font arrives, so the ruler is
  // drawn again once its font has loaded.
  let rulerFontLoaded = $state(false);
  $effect(() => {
    void document.fonts.load(RULER_FONT).then(() => {
      rulerFontLoaded = true;
    });
  });

  $effect(() => {
    if (!canvas || !root || viewport.width <= 0) return;
    void themeRevision;
    void rulerFontLoaded;
    drawTimeline({
      canvas,
      themeSource: root,
      viewportWidthPx: viewport.width,
      scrollLeft: viewport.scrollLeft,
      durationUs,
      contentWidthPx: viewport.contentWidthPx,
      level: selectedLevel,
    });
  });

  let tabStopIndex = $derived(
    focusableCueIndex(
      cues.findIndex((cue) => cue.id === selectedCueId),
      cues.length,
    ),
  );

  function cueBody(index: number): HTMLElement | null {
    const cue = cues[index];
    return cue
      ? (root?.querySelector<HTMLElement>(
          `[data-cue-id="${CSS.escape(cue.id)}"] [data-cue-part="whole"]`,
        ) ?? null)
      : null;
  }

  function navigate(fromIndex: number, key: string): boolean {
    const next = nextRovingIndex(fromIndex, key, cues.length);
    if (next === null) return false;
    onselect(cues[next].id);
    cueBody(next)?.focus();
    return true;
  }

  // A selection that changes elsewhere, such as during playback, carries
  // keyboard focus along while it is on another cue.
  $effect(() => {
    const index = tabStopIndex;
    const focusedCue = untrack(() =>
      root?.contains(document.activeElement)
        ? document.activeElement?.closest<HTMLElement>("[data-cue-id]")
        : null,
    );
    if (!focusedCue || focusedCue.dataset.cueId === cues[index]?.id) return;
    untrack(() => cueBody(index))?.focus({ preventScroll: true });
  });
</script>

<section
  class="grid h-[min(11.25rem,24dvh)] min-h-42 min-w-0 grid-rows-[2.25rem_minmax(0,1fr)] overflow-hidden border-y border-border bg-surface text-text max-[42rem]:h-42"
  bind:this={root}
  aria-label="Waveform timeline"
>
  <TimelineToolbar
    {playbackUs}
    zoom={viewport.zoom}
    maxZoom={MAX_ZOOM}
    onzoom={viewport.setZoom}
  />

  <p id={`${uid}-instructions`} class="sr-only">
    Click the timeline to seek. Drag empty space to pan. While zoomed, use the
    mouse wheel or trackpad to pan horizontally.
    {#if editable}
      Dragging a cue stops at its neighbours; hold Alt to drag past them. Press
      Escape to cancel a pointer drag.
    {/if}
  </p>
  <p id={`${uid}-cue-keys`} class="sr-only">
    Left and Right Arrow move between cues; Home and End jump to the first and
    last cue.
    {#if editable}
      Alt with an arrow adjusts the cue by one millisecond, Alt and Shift by 100
      milliseconds. Press [ or ] to focus its start or end handle.
    {/if}
  </p>
  <p id={`${uid}-handle-keys`} class="sr-only">
    Alt with an arrow adjusts this edge by one millisecond, Alt and Shift by 100
    milliseconds. Arrow keys without Alt move the playhead. Press Escape to
    return to the cue.
  </p>

  <div class="relative h-full min-h-0 min-w-0 overflow-hidden">
    <div
      class={[
        "relative h-full min-h-0 min-w-0 overflow-x-auto overflow-y-hidden overscroll-x-contain bg-surface-sunken [scrollbar-width:thin]",
        viewport.panning ? "cursor-grabbing select-none" : "cursor-crosshair",
      ]}
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
        class="relative min-w-full touch-none"
        style:width={`${viewport.contentWidthPx}px`}
        style:height={`${TRACK_HEIGHT}px`}
      >
        <canvas
          class="pointer-events-none sticky left-0 block max-w-none"
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
            tabStop={cueIndex === tabStopIndex}
            {durationUs}
            contentWidthPx={viewport.contentWidthPx}
            neighbourBounds={neighbourBounds(cues, cueIndex, durationUs)}
            {editable}
            cueKeysId={`${uid}-cue-keys`}
            handleKeysId={`${uid}-handle-keys`}
            {onselect}
            onnavigate={(key) => navigate(cueIndex, key)}
            ondragstart={viewport.cancelPan}
            {oncommittiming}
          />
        {/each}

        {#if durationUs > 0}
          <div
            class="pointer-events-none absolute inset-y-0 z-6 w-px bg-danger"
            style:left={`${timeToPx(clampInteger(playbackUs, 0, durationUs), durationUs, viewport.contentWidthPx)}px`}
            aria-hidden="true"
          >
            <span
              class="absolute top-0 -left-1 h-[7px] w-[9px] bg-danger [clip-path:polygon(0_0,100%_0,50%_100%)]"
            ></span>
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
