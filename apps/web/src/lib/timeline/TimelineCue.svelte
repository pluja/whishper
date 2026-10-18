<script lang="ts">
  import { formatEditorTime } from "$lib/shared/subtitles";
  import {
    cueIsValid,
    dragBounds,
    pxToTime,
    timeToPx,
    timingAfterDelta,
    type CueTiming,
    type TimingGesture,
    type TimingBounds,
    type TimingPart,
  } from "./math";
  import {
    capturePointer,
    isCapturedPointer,
    releasePointer,
    type PointerCapture,
  } from "./pointer-drag";
  import { timelineKeyAction } from "./key-action";

  type Props = {
    cue: CueTiming & { text: string };
    number: number;
    selected: boolean;
    tabStop: boolean;
    durationUs: number;
    contentWidthPx: number;
    neighbourBounds: TimingBounds;
    editable: boolean;
    cueKeysId: string;
    handleKeysId: string;
    onselect: (cueId: string) => void;
    onnavigate: (key: string) => boolean;
    ondragstart: () => void;
    oncommittiming: (timing: CueTiming, gesture: TimingGesture) => void;
  };

  type TimingDrag = PointerCapture & {
    part: TimingPart;
    originClientX: number;
    durationUs: number;
    contentWidthPx: number;
    neighbourBounds: TimingBounds;
    original: CueTiming;
    preview: CueTiming;
  };

  const FOCUS_RING =
    "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus";
  // 8 px handles meet WCAG 2.5.8 through the equivalent-control exception:
  // the cue list time inputs edit the same timing.
  const HANDLE_CLASSES = `pointer-events-auto absolute inset-y-0 z-3 w-2 cursor-ew-resize focus-visible:z-8 after:absolute after:top-1.5 after:h-4 after:w-0.5 after:rounded-full after:bg-text/75 ${FOCUS_RING}`;

  let {
    cue,
    number,
    selected,
    tabStop,
    durationUs,
    contentWidthPx,
    neighbourBounds,
    editable,
    cueKeysId,
    handleKeysId,
    onselect,
    onnavigate,
    ondragstart,
    oncommittiming,
  }: Props = $props();

  let drag = $state.raw<TimingDrag | null>(null);
  let body = $state<HTMLButtonElement>();
  let startHandle = $state<HTMLButtonElement>();
  let endHandle = $state<HTMLButtonElement>();

  let timing = $derived(drag?.preview ?? cue);
  let label = $derived(selected ? "selected cue" : "cue");
  let highlighted = $derived(selected || drag !== null);
  let handleGripClasses = $derived(
    selected
      ? "after:opacity-100"
      : "after:opacity-0 hover:after:opacity-100 focus-visible:after:opacity-100",
  );
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

  function cancelDrag(event?: Event): void {
    const active = drag;
    if (!active) return;
    event?.preventDefault();
    event?.stopPropagation();
    releasePointer(active);
    drag = null;
  }

  function beginDrag(event: PointerEvent, part: TimingPart): void {
    if (event.button !== 0) return;
    if (!editable) {
      event.stopPropagation();
      onselect(cue.id);
      return;
    }
    if (durationUs <= 0 || !cueIsValid(cue, durationUs)) return;
    event.preventDefault();
    event.stopPropagation();
    ondragstart();
    onselect(cue.id);

    (event.currentTarget as HTMLElement).focus();
    const original = { id: cue.id, start_us: cue.start_us, end_us: cue.end_us };
    drag = {
      ...capturePointer(event),
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
    if (!isCapturedPointer(active, event)) return null;
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
    if (!isUnchanged(final, active.original)) oncommittiming(final, "drag");
  }

  function nudge(edge: TimingPart, deltaUs: number): void {
    if (!cueIsValid(cue, durationUs)) return;
    const next = timingAfterDelta(cue, edge, deltaUs, neighbourBounds);
    if (!isUnchanged(next, cue)) oncommittiming(next, "nudge");
  }

  function claim(event: KeyboardEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  function handleKeydown(event: KeyboardEvent, part: TimingPart): void {
    const action = timelineKeyAction(event, part, editable, drag !== null);
    switch (action.kind) {
      case "cancel_drag":
        cancelDrag(event);
        return;
      case "nudge":
        claim(event);
        nudge(action.edge, action.deltaUs);
        return;
      case "block":
        claim(event);
        return;
      case "focus_handle":
        claim(event);
        (action.edge === "start" ? startHandle : endHandle)?.focus();
        return;
      case "return_to_body":
        claim(event);
        body?.focus();
        return;
      case "navigate":
        if (onnavigate(action.key)) claim(event);
        return;
      case "none":
        return;
    }
  }

  function interactions(part: TimingPart) {
    return {
      onpointerdown: (event: PointerEvent) => beginDrag(event, part),
      onpointermove: moveDrag,
      onpointerup: finishDrag,
      onpointercancel: cancelDrag,
      onlostpointercapture: cancelDrag,
      onkeydown: (event: KeyboardEvent) => handleKeydown(event, part),
      onclick: (event: MouseEvent) => {
        event.stopPropagation();
        onselect(cue.id);
      },
    };
  }

  // Cue text is multiline; the timeline block has room for one line.
  function singleLine(text: string): string {
    return text.replace(/\s+/g, " ").trim();
  }
</script>

<div
  class={[
    "pointer-events-none absolute top-[86px] h-9 min-w-0.5",
    selected ? "z-4" : "z-2",
  ]}
  style:left={`${left}px`}
  style:width={`${Math.max(2, width)}px`}
  data-cue-id={cue.id}
>
  <button
    bind:this={body}
    class={[
      "pointer-events-auto absolute inset-0 overflow-hidden rounded-sm border text-start text-text",
      FOCUS_RING,
      highlighted
        ? "border-accent bg-accent/30 ring-1 ring-accent/30"
        : "border-accent/80 bg-accent/15 hover:bg-accent/25",
      editable ? (drag ? "cursor-grabbing" : "cursor-grab") : "cursor-pointer",
    ]}
    type="button"
    tabindex={tabStop ? 0 : -1}
    aria-describedby={cueKeysId}
    data-cue-part="whole"
    {...interactions("whole")}
  >
    <span class="sr-only">{selected ? "Selected cue" : "Cue"}</span>
    <span
      class={[
        "absolute top-[3px] left-1.5 font-mono text-[0.6875rem] leading-none font-semibold tabular-nums",
        highlighted ? "text-text" : "text-text-muted",
      ]}>{number}</span
    >
    <span
      class="block truncate px-1.5 pt-[17px] text-[0.6875rem] leading-[1.3] font-medium"
      >{singleLine(cue.text)}</span
    ><span class="sr-only"
      >, {formatEditorTime(timing.start_us)} to {formatEditorTime(
        timing.end_us,
      )}</span
    >
  </button>
  {#if editable}
    <button
      bind:this={startHandle}
      class={[HANDLE_CLASSES, handleGripClasses, "left-0 after:left-0.5"]}
      type="button"
      tabindex="-1"
      aria-label={`Adjust start of ${label} ${number}, currently ${formatEditorTime(timing.start_us)}`}
      aria-describedby={handleKeysId}
      {...interactions("start")}
    ></button>
    <button
      bind:this={endHandle}
      class={[HANDLE_CLASSES, handleGripClasses, "right-0 after:right-0.5"]}
      type="button"
      tabindex="-1"
      aria-label={`Adjust end of ${label} ${number}, currently ${formatEditorTime(timing.end_us)}`}
      aria-describedby={handleKeysId}
      {...interactions("end")}
    ></button>
  {/if}
</div>
