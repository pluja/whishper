<script lang="ts">
  import { tick, untrack } from "svelte";
  import TimelineCue from "./TimelineCue.svelte";
  import TimelineStatus, {
    type LoadState,
    type ProbeState,
  } from "./TimelineStatus.svelte";
  import TimelineToolbar from "./TimelineToolbar.svelte";
  import { drawTimeline, TRACK_HEIGHT } from "$lib/timeline/draw";
  import {
    clampInteger,
    clampNumber,
    neighbourBounds,
    pxToTime,
    scrollLeftCentredOn,
    scrollLeftRevealing,
    timeToPx,
    type CueTiming,
  } from "$lib/timeline/math";
  import {
    chooseWaveformLevel,
    loadWaveform,
    waveformMatchesDuration,
    type DecodedWaveform,
  } from "$lib/timeline/waveform";

  type Props = {
    durationUs: number;
    probeState: ProbeState;
    waveformUrl: string | null;
    cues: readonly (CueTiming & { text: string })[];
    selectedCueId: string | null;
    playbackUs: number;
    playing: boolean;
    onseek: (us: number) => void;
    onselect: (cueId: string) => void;
    oncommittiming: (timing: CueTiming) => void;
  };

  type PanDrag = {
    pointerId: number;
    owner: HTMLElement;
    originClientX: number;
    originScrollLeft: number;
    moved: boolean;
  };

  const MAX_ZOOM = 64;
  const PLAYHEAD_GUTTER_PX = 5;
  const WHEEL_LINE_PX = 16;
  const PAN_THRESHOLD_PX = 3;
  // Browsers may round a programmatic scrollLeft by a fraction of a pixel.
  const SCROLL_ECHO_TOLERANCE_PX = 1;

  let {
    durationUs,
    probeState,
    waveformUrl,
    cues,
    selectedCueId,
    playbackUs,
    playing,
    onseek,
    onselect,
    oncommittiming,
  }: Props = $props();

  const uid = $props.id();

  let root = $state<HTMLElement>();
  let viewport = $state<HTMLDivElement>();
  let canvas = $state<HTMLCanvasElement>();
  let viewportWidth = $state(0);
  let scrollLeft = $state(0);
  let zoom = $state(1);
  let waveform = $state.raw<DecodedWaveform | null>(null);
  let loadState = $state<LoadState>("idle");
  let loadError = $state("");
  let panDrag = $state.raw<PanDrag | null>(null);
  let followPlayhead = true;
  let lastAutoScrollLeft = 0;

  let timelineDurationUs = $derived(
    Number.isSafeInteger(durationUs) && durationUs > 0 ? durationUs : 0,
  );
  let contentWidthPx = $derived(
    Math.max(1, viewportWidth, Math.round(viewportWidth * zoom)),
  );
  let waveformMismatch = $derived(
    waveform !== null && !waveformMatchesDuration(waveform, timelineDurationUs),
  );
  let selectedLevel = $derived(
    waveformMismatch || timelineDurationUs <= 0
      ? null
      : chooseWaveformLevel(
          waveform,
          (contentWidthPx * 1_000_000) / timelineDurationUs,
        ),
  );
  $effect(() => {
    const url = waveformUrl;
    const controller = new AbortController();

    waveform = null;
    loadError = "";
    if (!url) {
      loadState = "idle";
      return () => controller.abort();
    }

    loadState = "loading";
    loadWaveform(url, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        waveform = value;
        loadState = "ready";
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        loadState = "failed";
        loadError =
          cause instanceof Error && cause.message.startsWith("Waveform")
            ? cause.message
            : "Waveform data is invalid or unavailable.";
      });

    return () => controller.abort();
  });

  $effect(() => {
    if (!canvas || !root || viewportWidth <= 0) return;
    drawTimeline({
      canvas,
      themeSource: root,
      viewportWidthPx: viewportWidth,
      scrollLeft,
      durationUs: timelineDurationUs,
      contentWidthPx,
      level: selectedLevel,
    });
  });

  $effect(() => {
    if (playing) followPlayhead = true;
  });

  // Only playback progress may scroll the view; zoom, resize and panning must
  // not pull it back to the playhead.
  $effect(() => {
    const timeUs = playbackUs;
    untrack(() => revealPlayhead(timeUs));
  });

  function scrollGeometry() {
    return {
      durationUs: timelineDurationUs,
      contentWidthPx,
      viewportWidthPx: viewportWidth,
    };
  }

  function revealPlayhead(timeUs: number) {
    const node = viewport;
    if (!node || !playing || !followPlayhead || panDrag) return;
    if (timelineDurationUs <= 0 || viewportWidth <= 0) return;
    const target = scrollLeftRevealing(
      timeUs,
      node.scrollLeft,
      PLAYHEAD_GUTTER_PX,
      scrollGeometry(),
    );
    if (node.scrollLeft === target) return;
    node.scrollLeft = target;
    lastAutoScrollLeft = node.scrollLeft;
  }

  function handleScroll() {
    if (!viewport) return;
    scrollLeft = viewport.scrollLeft;
    if (Math.abs(scrollLeft - lastAutoScrollLeft) > SCROLL_ECHO_TOLERANCE_PX) {
      followPlayhead = false;
    }
    lastAutoScrollLeft = scrollLeft;
  }

  function positionFromClientX(clientX: number) {
    if (!viewport || timelineDurationUs <= 0) return 0;
    const bounds = viewport.getBoundingClientRect();
    const contentX = viewport.scrollLeft + clientX - bounds.left;
    return clampInteger(
      pxToTime(contentX, timelineDurationUs, contentWidthPx),
      0,
      timelineDurationUs,
    );
  }

  function releasePointer(active: PanDrag) {
    if (active.owner.hasPointerCapture(active.pointerId)) {
      active.owner.releasePointerCapture(active.pointerId);
    }
  }

  function beginPan(event: PointerEvent) {
    if (event.button !== 0 || !viewport || timelineDurationUs <= 0) return;
    event.preventDefault();
    const owner = event.currentTarget as HTMLElement;
    owner.setPointerCapture(event.pointerId);
    panDrag = {
      pointerId: event.pointerId,
      owner,
      originClientX: event.clientX,
      originScrollLeft: viewport.scrollLeft,
      moved: false,
    };
  }

  function movePan(event: PointerEvent) {
    const active = panDrag;
    if (!active || event.pointerId !== active.pointerId || !viewport) return;
    event.preventDefault();
    const distance = event.clientX - active.originClientX;
    const moved = active.moved || Math.abs(distance) >= PAN_THRESHOLD_PX;
    viewport.scrollLeft = active.originScrollLeft - distance;
    if (moved !== active.moved) panDrag = { ...active, moved };
  }

  function finishPan(event: PointerEvent) {
    const active = panDrag;
    if (!active || event.pointerId !== active.pointerId) return;
    event.preventDefault();
    releasePointer(active);
    panDrag = null;
    if (!active.moved) onseek(positionFromClientX(event.clientX));
  }

  function cancelPan(event?: Event) {
    const active = panDrag;
    if (!active) return;
    event?.preventDefault();
    event?.stopPropagation();
    releasePointer(active);
    panDrag = null;
  }

  async function setZoom(nextZoom: number) {
    const node = viewport;
    if (!node || viewportWidth <= 0 || timelineDurationUs <= 0) return;
    const targetZoom = clampNumber(nextZoom, 1, MAX_ZOOM);
    if (targetZoom === zoom) return;

    followPlayhead = false;
    const centreTimeUs = clampNumber(
      pxToTime(
        node.scrollLeft + node.clientWidth / 2,
        timelineDurationUs,
        contentWidthPx,
      ),
      0,
      timelineDurationUs,
    );
    zoom = targetZoom;
    await tick();

    if (viewport !== node || node.clientWidth <= 0) return;
    node.scrollLeft = scrollLeftCentredOn(centreTimeUs, scrollGeometry());
  }

  function handleWheelPan(event: WheelEvent) {
    const node = viewport;
    if (!node || event.ctrlKey) return;

    let delta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      delta *= WHEEL_LINE_PX;
    } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      delta *= node.clientWidth;
    }
    if (!Number.isFinite(delta) || delta === 0) return;

    const maxScrollLeft = node.scrollWidth - node.clientWidth;
    if (maxScrollLeft <= 0) return;

    const targetScrollLeft = clampNumber(
      node.scrollLeft + delta,
      0,
      maxScrollLeft,
    );
    if (targetScrollLeft === node.scrollLeft) return;

    event.preventDefault();
    node.scrollLeft = targetScrollLeft;
  }
</script>

<section
  class="studio-waveform"
  bind:this={root}
  aria-label="Waveform timeline"
>
  <TimelineToolbar {playbackUs} {zoom} maxZoom={MAX_ZOOM} onzoom={setZoom} />

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
      class:panning={panDrag?.moved}
      bind:this={viewport}
      bind:clientWidth={viewportWidth}
      role="region"
      aria-label="Scrollable waveform and subtitle cues"
      aria-describedby={`${uid}-instructions`}
      onscroll={handleScroll}
      onwheel={handleWheelPan}
      onpointerdown={beginPan}
      onpointermove={movePan}
      onpointerup={finishPan}
      onpointercancel={cancelPan}
      onlostpointercapture={cancelPan}
    >
      <div class="timeline-content" style:width={`${contentWidthPx}px`}>
        <canvas
          class="timeline-canvas"
          bind:this={canvas}
          style:width={`${Math.max(1, viewportWidth)}px`}
          style:height={`${TRACK_HEIGHT}px`}
          aria-hidden="true"
        ></canvas>

        {#each cues as cue, cueIndex (cue.id)}
          <TimelineCue
            {cue}
            number={cueIndex + 1}
            selected={cue.id === selectedCueId}
            durationUs={timelineDurationUs}
            {contentWidthPx}
            neighbourBounds={neighbourBounds(
              cues,
              cueIndex,
              timelineDurationUs,
            )}
            {onselect}
            {oncommittiming}
          />
        {/each}

        {#if timelineDurationUs > 0}
          <div
            class="playhead"
            style:left={`${timeToPx(clampInteger(playbackUs, 0, timelineDurationUs), timelineDurationUs, contentWidthPx)}px`}
            aria-hidden="true"
          >
            <span></span>
          </div>
        {/if}
      </div>
    </div>

    <TimelineStatus
      {loadState}
      {loadError}
      {probeState}
      hasWaveform={waveform !== null}
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
