<script lang="ts">
  import { formatEditorTime } from "$lib/subtitles";
  import {
    cueIsValid,
    dragBounds,
    pxToTime,
    timeToPx,
    timingAfterDelta,
    type CueTiming,
    type TimingBounds,
    type TimingPart,
  } from "$lib/timeline/math";

  type Props = {
    cue: CueTiming & { text: string };
    number: number;
    selected: boolean;
    durationUs: number;
    contentWidthPx: number;
    neighbourBounds: TimingBounds;
    onselect: (cueId: string) => void;
    ondragstart: () => void;
    oncommittiming: (timing: CueTiming) => void;
  };

  type TimingDrag = {
    pointerId: number;
    owner: HTMLElement;
    part: TimingPart;
    originClientX: number;
    durationUs: number;
    contentWidthPx: number;
    neighbourBounds: TimingBounds;
    original: CueTiming;
    preview: CueTiming;
  };

  const NUDGE_US = 1_000;
  const LARGE_NUDGE_US = 100_000;

  let {
    cue,
    number,
    selected,
    durationUs,
    contentWidthPx,
    neighbourBounds,
    onselect,
    ondragstart,
    oncommittiming,
  }: Props = $props();

  let drag = $state.raw<TimingDrag | null>(null);

  let timing = $derived(drag?.preview ?? cue);
  let label = $derived(selected ? "selected cue" : "cue");
  let left = $derived(timeToPx(timing.start_us, durationUs, contentWidthPx));
  let width = $derived(
    timeToPx(timing.end_us - timing.start_us, durationUs, contentWidthPx),
  );

  function isUnchanged(next: CueTiming, previous: CueTiming): boolean {
    return (
      next.start_us === previous.start_us && next.end_us === previous.end_us
    );
  }

  // Alt lifts the neighbour limits so a cue can deliberately pass another.
  function dragTiming(active: TimingDrag, event: PointerEvent): CueTiming {
    const deltaUs = pxToTime(
      event.clientX - active.originClientX,
      active.durationUs,
      active.contentWidthPx,
    );
    return timingAfterDelta(
      active.original,
      active.part,
      deltaUs,
      dragBounds(active.neighbourBounds, active.durationUs, event.altKey),
    );
  }

  function dragIsCurrent(active: TimingDrag): boolean {
    return (
      active.durationUs === durationUs && isUnchanged(cue, active.original)
    );
  }

  function releasePointer(active: TimingDrag): void {
    if (active.owner.hasPointerCapture(active.pointerId)) {
      active.owner.releasePointerCapture(active.pointerId);
    }
  }

  function cancelDrag(event?: Event): void {
    const active = drag;
    if (!active) return;
    event?.preventDefault();
    event?.stopPropagation();
    releasePointer(active);
    drag = null;
  }

  function beginDrag(event: PointerEvent, part: TimingPart): void {
    if (event.button !== 0 || durationUs <= 0 || !cueIsValid(cue, durationUs))
      return;
    event.preventDefault();
    event.stopPropagation();
    ondragstart();
    onselect(cue.id);

    const owner = event.currentTarget as HTMLElement;
    owner.focus();
    owner.setPointerCapture(event.pointerId);
    const original = { id: cue.id, start_us: cue.start_us, end_us: cue.end_us };
    drag = {
      pointerId: event.pointerId,
      owner,
      part,
      originClientX: event.clientX,
      durationUs,
      contentWidthPx,
      neighbourBounds,
      original,
      preview: original,
    };
  }

  function activeDragFor(event: PointerEvent): TimingDrag | null {
    const active = drag;
    if (!active || event.pointerId !== active.pointerId) return null;
    if (!dragIsCurrent(active)) {
      cancelDrag(event);
      return null;
    }
    event.preventDefault();
    event.stopPropagation();
    return active;
  }

  function moveDrag(event: PointerEvent): void {
    const active = activeDragFor(event);
    if (active) drag = { ...active, preview: dragTiming(active, event) };
  }

  function finishDrag(event: PointerEvent): void {
    const active = activeDragFor(event);
    if (!active) return;
    const final = dragTiming(active, event);
    releasePointer(active);
    drag = null;
    if (!isUnchanged(final, active.original)) oncommittiming(final);
  }

  function nudge(event: KeyboardEvent, part: TimingPart): void {
    if (event.key === "Escape" && drag) {
      cancelDrag(event);
      return;
    }
    if (
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (!cueIsValid(cue, durationUs)) return;
    const stepUs = event.shiftKey ? LARGE_NUDGE_US : NUDGE_US;
    const next = timingAfterDelta(
      cue,
      part,
      event.key === "ArrowLeft" ? -stepUs : stepUs,
      neighbourBounds,
    );
    if (!isUnchanged(next, cue)) oncommittiming(next);
  }

  function interactions(part: TimingPart) {
    return {
      onpointerdown: (event: PointerEvent) => beginDrag(event, part),
      onpointermove: moveDrag,
      onpointerup: finishDrag,
      onpointercancel: cancelDrag,
      onlostpointercapture: cancelDrag,
      onkeydown: (event: KeyboardEvent) => nudge(event, part),
      onclick: (event: MouseEvent) => event.stopPropagation(),
    };
  }

  // Cue text is multiline; the timeline block has room for one line.
  function singleLine(text: string): string {
    return text.replace(/\s+/g, " ").trim();
  }
</script>

<div
  class="cue-shell"
  class:selected
  class:dragging={drag !== null}
  style:left={`${left}px`}
  style:width={`${Math.max(2, width)}px`}
  data-cue-id={cue.id}
>
  <button
    class="cue-body"
    type="button"
    aria-label={`${selected ? "Selected cue" : "Cue"} ${number}, ${formatEditorTime(timing.start_us)} to ${formatEditorTime(timing.end_us)}. Drag to move, holding Alt to pass neighbouring cues; Arrow keys adjust by one millisecond, Shift+Arrow by 100 milliseconds.`}
    {...interactions("whole")}
  >
    <span class="timeline-cue-number">{number}</span>
    <span class="timeline-cue-text">{singleLine(cue.text)}</span>
  </button>
  <button
    class="cue-handle start"
    type="button"
    aria-label={`Adjust start of ${label} ${number}, currently ${formatEditorTime(timing.start_us)}. Arrow keys adjust by one millisecond, Shift+Arrow by 100 milliseconds.`}
    {...interactions("start")}
  ></button>
  <button
    class="cue-handle end"
    type="button"
    aria-label={`Adjust end of ${label} ${number}, currently ${formatEditorTime(timing.end_us)}. Arrow keys adjust by one millisecond, Shift+Arrow by 100 milliseconds.`}
    {...interactions("end")}
  ></button>
</div>

<style>
  .cue-shell {
    position: absolute;
    z-index: 2;
    top: 86px;
    height: 36px;
    min-width: 2px;
    pointer-events: none;
  }

  .cue-body,
  .cue-handle {
    position: absolute;
    top: 0;
    height: 100%;
    border: 0;
    padding: 0;
    color: #d8d7ff;
    pointer-events: auto;
  }

  .cue-body:focus-visible,
  .cue-handle:focus-visible {
    outline: 2px solid var(--waveform-accent);
    outline-offset: -2px;
  }

  .cue-handle:focus-visible {
    z-index: 8;
  }

  .cue-body {
    inset-inline: 0;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--waveform-accent) 48%, #3b4050);
    border-radius: 0.2rem;
    background: color-mix(in srgb, var(--waveform-accent) 22%, #20242b);
    cursor: grab;
    text-align: start;
  }

  .timeline-cue-number {
    position: absolute;
    top: 3px;
    left: 0.4rem;
    font-size: 0.6875rem;
    font-weight: 640;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    color: color-mix(in srgb, #d8d7ff 55%, transparent);
  }

  .timeline-cue-text {
    display: block;
    overflow: hidden;
    padding: 17px 0.4rem 0;
    font-size: 0.6875rem;
    font-weight: 500;
    line-height: 1.3;
    color: color-mix(in srgb, #d8d7ff 72%, transparent);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cue-body:hover {
    background: color-mix(in srgb, var(--waveform-accent) 29%, #20242b);
  }

  .cue-shell.selected {
    z-index: 4;
  }

  .cue-shell.selected .cue-body,
  .cue-shell.dragging .cue-body {
    border-color: var(--waveform-accent);
    background: color-mix(in srgb, var(--waveform-accent) 38%, #20242b);
    box-shadow: 0 0 0 1px
      color-mix(in srgb, var(--waveform-accent) 32%, transparent);
    color: white;
  }

  .cue-shell.selected .timeline-cue-number,
  .cue-shell.dragging .timeline-cue-number {
    color: color-mix(in srgb, white 78%, transparent);
  }

  .cue-shell.selected .timeline-cue-text,
  .cue-shell.dragging .timeline-cue-text {
    color: white;
  }

  .cue-shell.dragging .cue-body {
    cursor: grabbing;
  }

  .cue-handle {
    z-index: 3;
    width: 8px;
    background: transparent;
    cursor: ew-resize;
  }

  .cue-handle::after {
    position: absolute;
    top: 6px;
    width: 2px;
    height: 16px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--waveform-text) 76%, transparent);
    content: "";
    opacity: 0;
  }

  .cue-handle.start {
    left: 0;
  }

  .cue-handle.start::after {
    left: 2px;
  }

  .cue-handle.end {
    right: 0;
  }

  .cue-handle.end::after {
    right: 2px;
  }

  .cue-shell.selected .cue-handle::after,
  .cue-handle:hover::after,
  .cue-handle:focus-visible::after {
    opacity: 1;
  }
</style>
