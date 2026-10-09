<script lang="ts">
  import { MEDIA_PREPARATION_VERSION } from "@anysub/contracts";
  import { tick } from "svelte";
  import { formatClock } from "$lib/format";
  import { formatEditorTime } from "$lib/subtitles";

  type ProbeState =
    "not_started" | "queued" | "running" | "completed" | "failed";

  type CueTiming = {
    id: string;
    start_us: number;
    end_us: number;
  };

  type TimelineCue = CueTiming & { text: string };

  type Props = {
    durationUs: number;
    probeState: ProbeState;
    waveformUrl: string | null;
    cues: readonly TimelineCue[];
    selectedCueId: string | null;
    playbackUs: number;
    onseek: (us: number) => void;
    onselect: (cueId: string) => void;
    oncommittiming: (timing: CueTiming) => void;
  };

  type DecodedWaveformLevel = {
    samplesPerPeak: number;
    peaksPerSecond: number;
    length: number;
    peaks: Int8Array;
  };

  type DecodedWaveform = {
    schemaVersion: typeof MEDIA_PREPARATION_VERSION;
    durationUs: number;
    sampleRate: number;
    channelMix: string;
    encoding: "signed-int8-min-max-base64";
    levels: readonly DecodedWaveformLevel[];
  };

  type TimingPart = "whole" | "start" | "end";

  type TimingDrag = {
    pointerId: number;
    owner: HTMLElement;
    part: TimingPart;
    originClientX: number;
    durationUs: number;
    contentWidthPx: number;
    original: CueTiming;
    preview: CueTiming;
  };

  type PanDrag = {
    pointerId: number;
    owner: HTMLElement;
    originClientX: number;
    originScrollLeft: number;
    moved: boolean;
  };

  type LoadState = "idle" | "loading" | "ready" | "failed";

  const TRACK_HEIGHT = 124;
  const RULER_HEIGHT = 25;
  const WAVEFORM_TOP = 27;
  const WAVEFORM_BOTTOM = 83;
  const MAX_ZOOM = 64;
  const NUDGE_US = 1_000;
  const PLAYHEAD_GUTTER_PX = 5;
  const WHEEL_LINE_PX = 16;

  let {
    durationUs,
    probeState,
    waveformUrl,
    cues,
    selectedCueId,
    playbackUs,
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
  let timingDrag = $state.raw<TimingDrag | null>(null);
  let panDrag = $state.raw<PanDrag | null>(null);

  let timelineDurationUs = $derived(
    Number.isSafeInteger(durationUs) && durationUs > 0 ? durationUs : 0,
  );
  let contentWidthPx = $derived(
    Math.max(1, viewportWidth, Math.round(viewportWidth * zoom)),
  );
  let pixelsPerSecond = $derived(
    timelineDurationUs > 0
      ? (contentWidthPx * 1_000_000) / timelineDurationUs
      : 0,
  );
  let selectedLevel = $derived.by(() =>
    chooseWaveformLevel(waveform, pixelsPerSecond),
  );
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
    if (waveform) return null;
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

  $effect(() => {
    const url = waveformUrl;
    const expectedDurationUs = timelineDurationUs;
    const controller = new AbortController();

    waveform = null;
    loadError = "";
    if (!url) {
      loadState = "idle";
      return () => controller.abort();
    }

    loadState = "loading";
    void fetch(url, {
      signal: controller.signal,
      credentials: "same-origin",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `Waveform request failed with status ${response.status}.`,
          );
        }
        const value = validateWaveform(await response.json());
        if (value.durationUs !== expectedDurationUs) {
          throw new Error("Waveform duration does not match the timeline.");
        }
        return value;
      })
      .then((value) => {
        if (controller.signal.aborted) return;
        waveform = value;
        loadState = "ready";
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        waveform = null;
        loadState = "failed";
        loadError =
          cause instanceof Error && cause.message.startsWith("Waveform")
            ? cause.message
            : "Waveform data is invalid or unavailable.";
      });

    return () => controller.abort();
  });

  $effect(() => {
    const node = canvas;
    const container = root;
    const width = viewportWidth;
    const offset = scrollLeft;
    const duration = timelineDurationUs;
    const totalWidth = contentWidthPx;
    const level = selectedLevel;

    if (!node || !container || width <= 0) return;
    drawTimelineCanvas(
      node,
      container,
      width,
      offset,
      duration,
      totalWidth,
      level,
    );
  });

  function scrollPlayheadIntoView(
    node: HTMLDivElement,
    currentPlaybackUs: number,
    duration: number,
    totalWidth: number,
    visibleWidth: number,
  ) {
    const maxScrollLeft = Math.max(0, totalWidth - visibleWidth);
    const currentScrollLeft = clampNumber(node.scrollLeft, 0, maxScrollLeft);
    const gutter = Math.min(PLAYHEAD_GUTTER_PX, visibleWidth / 2);
    const playheadX =
      (clampInteger(currentPlaybackUs, 0, duration) / duration) * totalWidth;
    let targetScrollLeft = currentScrollLeft;

    if (playheadX <= currentScrollLeft + gutter) {
      targetScrollLeft = playheadX - gutter;
    } else if (playheadX >= currentScrollLeft + visibleWidth - gutter) {
      targetScrollLeft = playheadX - visibleWidth + gutter;
    }

    targetScrollLeft = clampNumber(targetScrollLeft, 0, maxScrollLeft);
    if (node.scrollLeft === targetScrollLeft) return;

    node.scrollLeft = targetScrollLeft;
  }

  $effect(() => {
    const node = viewport;
    const currentPlaybackUs = playbackUs;
    const duration = timelineDurationUs;
    const totalWidth = contentWidthPx;
    const visibleWidth = viewportWidth;

    if (!node || duration <= 0 || visibleWidth <= 0) return;

    scrollPlayheadIntoView(
      node,
      currentPlaybackUs,
      duration,
      totalWidth,
      visibleWidth,
    );
  });

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  function decodePeaks(data: string, expectedLength: number): Int8Array {
    if (
      data.length === 0 ||
      data.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        data,
      )
    ) {
      throw new Error("Waveform peak data is not valid base64.");
    }

    let binary: string;
    try {
      binary = atob(data);
    } catch {
      throw new Error("Waveform peak data could not be decoded.");
    }
    if (binary.length !== expectedLength * 2) {
      throw new Error("Waveform peak data has an unexpected length.");
    }

    const peaks = new Int8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      peaks[index] = binary.charCodeAt(index) - 128;
    }
    return peaks;
  }

  function validateWaveform(value: unknown): DecodedWaveform {
    if (
      !isRecord(value) ||
      value.schemaVersion !== MEDIA_PREPARATION_VERSION ||
      value.encoding !== "signed-int8-min-max-base64" ||
      !Number.isSafeInteger(value.durationUs) ||
      (value.durationUs as number) < 0 ||
      !Number.isSafeInteger(value.sampleRate) ||
      (value.sampleRate as number) <= 0 ||
      typeof value.channelMix !== "string" ||
      value.channelMix.length === 0 ||
      !Array.isArray(value.levels) ||
      value.levels.length === 0
    ) {
      throw new Error(
        `Waveform JSON does not match schema ${MEDIA_PREPARATION_VERSION}.`,
      );
    }

    const levels = value.levels.map((candidate) => {
      if (
        !isRecord(candidate) ||
        !Number.isSafeInteger(candidate.samplesPerPeak) ||
        (candidate.samplesPerPeak as number) <= 0 ||
        typeof candidate.peaksPerSecond !== "number" ||
        !Number.isFinite(candidate.peaksPerSecond) ||
        candidate.peaksPerSecond <= 0 ||
        !Number.isSafeInteger(candidate.length) ||
        (candidate.length as number) <= 0 ||
        typeof candidate.data !== "string"
      ) {
        throw new Error("Waveform JSON contains an invalid level.");
      }

      const length = candidate.length as number;
      return {
        samplesPerPeak: candidate.samplesPerPeak as number,
        peaksPerSecond: candidate.peaksPerSecond,
        length,
        peaks: decodePeaks(candidate.data, length),
      } satisfies DecodedWaveformLevel;
    });

    return {
      schemaVersion: MEDIA_PREPARATION_VERSION,
      durationUs: value.durationUs as number,
      sampleRate: value.sampleRate as number,
      channelMix: value.channelMix,
      encoding: "signed-int8-min-max-base64",
      levels,
    };
  }

  function chooseWaveformLevel(
    value: DecodedWaveform | null,
    targetPeaksPerSecond: number,
  ): DecodedWaveformLevel | null {
    if (!value || targetPeaksPerSecond <= 0) return null;

    let best = value.levels[0];
    let bestDistance = Math.abs(
      Math.log(best.peaksPerSecond / targetPeaksPerSecond),
    );
    for (let index = 1; index < value.levels.length; index += 1) {
      const level = value.levels[index];
      const distance = Math.abs(
        Math.log(level.peaksPerSecond / targetPeaksPerSecond),
      );
      if (distance < bestDistance) {
        best = level;
        bestDistance = distance;
      }
    }
    return best;
  }

  function cssColor(
    styles: CSSStyleDeclaration,
    name: string,
    fallback: string,
  ) {
    return styles.getPropertyValue(name).trim() || fallback;
  }

  function drawTimelineCanvas(
    node: HTMLCanvasElement,
    container: HTMLElement,
    width: number,
    offset: number,
    duration: number,
    totalWidth: number,
    level: DecodedWaveformLevel | null,
  ) {
    const dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.round(TRACK_HEIGHT * dpr);
    if (node.width !== pixelWidth) node.width = pixelWidth;
    if (node.height !== pixelHeight) node.height = pixelHeight;

    const context = node.getContext("2d");
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, TRACK_HEIGHT);

    const styles = getComputedStyle(container);
    const rulerColor = cssColor(styles, "--studio-muted", "#858c97");
    const lineColor = cssColor(styles, "--studio-border", "#343940");
    const waveformColor = cssColor(styles, "--studio-waveform", "#7772c9");
    const baselineColor = cssColor(styles, "--studio-border-soft", "#292d33");

    context.strokeStyle = lineColor;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, RULER_HEIGHT + 0.5);
    context.lineTo(width, RULER_HEIGHT + 0.5);
    context.stroke();

    if (duration > 0) {
      const pixelsPerUs = totalWidth / duration;
      const visibleStartUs = clampInteger(
        Math.floor(offset / pixelsPerUs),
        0,
        duration,
      );
      const visibleEndUs = clampInteger(
        Math.ceil((offset + width) / pixelsPerUs),
        0,
        duration,
      );
      const majorStepUs = rulerStepUs(80 / pixelsPerUs);
      const firstMajorUs =
        Math.ceil(visibleStartUs / majorStepUs) * majorStepUs;

      context.fillStyle = rulerColor;
      context.strokeStyle = lineColor;
      context.font = '10px ui-monospace, "SFMono-Regular", monospace';
      context.textBaseline = "top";
      context.beginPath();
      for (
        let tickUs = firstMajorUs;
        tickUs <= visibleEndUs;
        tickUs += majorStepUs
      ) {
        const x = Math.round(tickUs * pixelsPerUs - offset) + 0.5;
        context.moveTo(x, 15);
        context.lineTo(x, RULER_HEIGHT);
        context.fillText(formatClock(Math.floor(tickUs / 1_000_000)), x + 4, 3);
      }
      context.stroke();

      const halfStepUs = majorStepUs / 2;
      if (Number.isInteger(halfStepUs)) {
        const firstMinorUs =
          Math.ceil(visibleStartUs / halfStepUs) * halfStepUs;
        context.beginPath();
        for (
          let tickUs = firstMinorUs;
          tickUs <= visibleEndUs;
          tickUs += halfStepUs
        ) {
          if (tickUs % majorStepUs === 0) continue;
          const x = Math.round(tickUs * pixelsPerUs - offset) + 0.5;
          context.moveTo(x, 20);
          context.lineTo(x, RULER_HEIGHT);
        }
        context.stroke();
      }

      const centerY = (WAVEFORM_TOP + WAVEFORM_BOTTOM) / 2;
      context.strokeStyle = baselineColor;
      context.beginPath();
      context.moveTo(0, centerY + 0.5);
      context.lineTo(width, centerY + 0.5);
      context.stroke();

      if (level) {
        const firstPeak = Math.max(
          0,
          Math.floor((visibleStartUs * level.peaksPerSecond) / 1_000_000) - 1,
        );
        const lastPeak = Math.min(
          level.length - 1,
          Math.ceil((visibleEndUs * level.peaksPerSecond) / 1_000_000) + 1,
        );
        const amplitude = (WAVEFORM_BOTTOM - WAVEFORM_TOP - 5) / 2;
        const peakWidth = Math.max(1, pixelsPerSecond / level.peaksPerSecond);

        context.strokeStyle = waveformColor;
        context.lineWidth = Math.min(2, peakWidth);
        context.beginPath();
        for (let index = firstPeak; index <= lastPeak; index += 1) {
          const x = (index / level.peaksPerSecond) * pixelsPerSecond - offset;
          const minimum = level.peaks[index * 2] / 128;
          const maximum = level.peaks[index * 2 + 1] / 127;
          context.moveTo(x, centerY - maximum * amplitude);
          context.lineTo(x, centerY - minimum * amplitude);
        }
        context.stroke();
      }
    }
  }

  function rulerStepUs(targetUs: number): number {
    if (!Number.isFinite(targetUs) || targetUs <= 1_000) return 1_000;
    const magnitude = 10 ** Math.floor(Math.log10(targetUs));
    const normalized = targetUs / magnitude;
    const multiplier =
      normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return Math.max(1_000, Math.round(multiplier * magnitude));
  }

  // Cue text is multiline; the timeline block has room for one line.
  function singleLine(text: string): string {
    return text.replace(/\s+/g, " ").trim();
  }

  function clampNumber(value: number, minimum: number, maximum: number) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function clampInteger(value: number, minimum: number, maximum: number) {
    return Math.round(clampNumber(value, minimum, maximum));
  }

  function cueIsValid(cue: CueTiming) {
    return (
      Number.isSafeInteger(cue.start_us) &&
      Number.isSafeInteger(cue.end_us) &&
      cue.start_us >= 0 &&
      cue.start_us <= cue.end_us &&
      cue.end_us <= timelineDurationUs
    );
  }

  function displayedTiming(cue: CueTiming): CueTiming {
    return timingDrag?.original.id === cue.id ? timingDrag.preview : cue;
  }

  function timingAfterDelta(
    original: CueTiming,
    part: TimingPart,
    deltaUs: number,
  ): CueTiming {
    const duration = timelineDurationUs;
    if (part === "whole") {
      const cueDuration = original.end_us - original.start_us;
      const start = clampInteger(
        original.start_us + deltaUs,
        0,
        Math.max(0, duration - cueDuration),
      );
      return { id: original.id, start_us: start, end_us: start + cueDuration };
    }
    if (part === "start") {
      return {
        id: original.id,
        start_us: clampInteger(original.start_us + deltaUs, 0, original.end_us),
        end_us: original.end_us,
      };
    }
    return {
      id: original.id,
      start_us: original.start_us,
      end_us: clampInteger(
        original.end_us + deltaUs,
        original.start_us,
        duration,
      ),
    };
  }

  function beginTimingDrag(
    event: PointerEvent,
    cue: CueTiming,
    part: TimingPart,
  ) {
    if (event.button !== 0 || timelineDurationUs <= 0 || !cueIsValid(cue))
      return;
    event.preventDefault();
    event.stopPropagation();
    cancelPan();
    onselect(cue.id);

    const owner = event.currentTarget as HTMLElement;
    owner.focus();
    owner.setPointerCapture(event.pointerId);
    const original = {
      id: cue.id,
      start_us: cue.start_us,
      end_us: cue.end_us,
    };
    timingDrag = {
      pointerId: event.pointerId,
      owner,
      part,
      originClientX: event.clientX,
      durationUs: timelineDurationUs,
      contentWidthPx,
      original,
      preview: original,
    };
  }

  function timingDragIsCurrent(active: TimingDrag) {
    const current = cues.find((cue) => cue.id === active.original.id);
    return (
      active.durationUs === timelineDurationUs &&
      current?.start_us === active.original.start_us &&
      current.end_us === active.original.end_us
    );
  }

  function moveTimingDrag(event: PointerEvent) {
    const active = timingDrag;
    if (!active || event.pointerId !== active.pointerId) return;
    if (!timingDragIsCurrent(active)) {
      cancelTimingDrag(event);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const deltaUs = Math.round(
      ((event.clientX - active.originClientX) / active.contentWidthPx) *
        active.durationUs,
    );
    timingDrag = {
      ...active,
      preview: timingAfterDelta(active.original, active.part, deltaUs),
    };
  }

  function finishTimingDrag(event: PointerEvent) {
    const active = timingDrag;
    if (!active || event.pointerId !== active.pointerId) return;
    if (!timingDragIsCurrent(active)) {
      cancelTimingDrag(event);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const deltaUs = Math.round(
      ((event.clientX - active.originClientX) / active.contentWidthPx) *
        active.durationUs,
    );
    const finalPreview = timingAfterDelta(
      active.original,
      active.part,
      deltaUs,
    );
    releasePointer(active.owner, active.pointerId);
    timingDrag = null;

    if (
      finalPreview.start_us !== active.original.start_us ||
      finalPreview.end_us !== active.original.end_us
    ) {
      oncommittiming(finalPreview);
    }
  }

  function cancelTimingDrag(event?: Event) {
    const active = timingDrag;
    if (!active) return;
    event?.preventDefault();
    event?.stopPropagation();
    releasePointer(active.owner, active.pointerId);
    timingDrag = null;
  }

  function releasePointer(owner: HTMLElement, pointerId: number) {
    if (owner.hasPointerCapture(pointerId))
      owner.releasePointerCapture(pointerId);
  }

  function commitKeyboardTiming(
    cue: CueTiming,
    part: TimingPart,
    deltaUs: number,
  ) {
    if (!cueIsValid(cue)) return;
    const next = timingAfterDelta(cue, part, deltaUs);
    if (next.start_us === cue.start_us && next.end_us === cue.end_us) return;
    oncommittiming(next);
  }

  function handleTimingKeydown(
    event: KeyboardEvent,
    cue: CueTiming,
    part: TimingPart,
  ) {
    if (event.key === "Escape" && timingDrag) {
      cancelTimingDrag(event);
      return;
    }
    if (
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    commitKeyboardTiming(
      cue,
      part,
      event.key === "ArrowLeft" ? -NUDGE_US : NUDGE_US,
    );
  }

  function positionFromClientX(clientX: number) {
    if (!viewport || timelineDurationUs <= 0) return 0;
    const bounds = viewport.getBoundingClientRect();
    const contentX = clampNumber(
      viewport.scrollLeft + clientX - bounds.left,
      0,
      contentWidthPx,
    );
    return clampInteger(
      (contentX / contentWidthPx) * timelineDurationUs,
      0,
      timelineDurationUs,
    );
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
    const moved = active.moved || Math.abs(distance) >= 3;
    viewport.scrollLeft = active.originScrollLeft - distance;
    scrollLeft = viewport.scrollLeft;
    if (moved !== active.moved) panDrag = { ...active, moved };
  }

  function finishPan(event: PointerEvent) {
    const active = panDrag;
    if (!active || event.pointerId !== active.pointerId) return;
    event.preventDefault();
    releasePointer(active.owner, active.pointerId);
    panDrag = null;
    if (!active.moved) onseek(positionFromClientX(event.clientX));
  }

  function cancelPan(event?: Event) {
    const active = panDrag;
    if (!active) return;
    event?.preventDefault();
    event?.stopPropagation();
    releasePointer(active.owner, active.pointerId);
    panDrag = null;
  }

  function handleScroll() {
    if (viewport) scrollLeft = viewport.scrollLeft;
  }

  async function setZoom(nextZoom: number) {
    const node = viewport;
    if (!node || viewportWidth <= 0 || timelineDurationUs <= 0) return;
    const targetZoom = clampNumber(nextZoom, 1, MAX_ZOOM);
    if (targetZoom === zoom) return;

    const centerTimeUs = clampNumber(
      ((node.scrollLeft + node.clientWidth / 2) / contentWidthPx) *
        timelineDurationUs,
      0,
      timelineDurationUs,
    );
    zoom = targetZoom;
    await tick();

    if (viewport !== node || node.clientWidth <= 0) return;
    const targetScrollLeft = clampNumber(
      (centerTimeUs / timelineDurationUs) * contentWidthPx -
        node.clientWidth / 2,
      0,
      Math.max(0, node.scrollWidth - node.clientWidth),
    );
    if (node.scrollLeft === targetScrollLeft) return;

    node.scrollLeft = targetScrollLeft;
  }

  function stopTimelineClick(event: MouseEvent) {
    event.stopPropagation();
  }

  function handleWheelPan(event: WheelEvent) {
    const node = viewport;
    if (!node || event.ctrlKey) return;

    let delta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
    if (!Number.isFinite(delta) || delta === 0) return;

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
    scrollLeft = node.scrollLeft;
  }
</script>

<section
  class="studio-waveform"
  bind:this={root}
  aria-label="Waveform timeline"
>
  <header class="timeline-toolbar">
    <div class="timeline-heading">
      <strong>Timeline</strong>
      <output aria-label="Current playback time"
        >{formatEditorTime(playbackUs)}</output
      >
    </div>
    <div class="timeline-controls" aria-label="Timeline view controls">
      <button
        type="button"
        onclick={() => setZoom(1)}
        disabled={zoom === 1}
        aria-label="Fit entire timeline">Fit</button
      >
      <button
        type="button"
        onclick={() => setZoom(zoom / 2)}
        disabled={zoom <= 1}
        aria-label="Zoom out">−</button
      >
      <span class="zoom-value" aria-live="polite"
        >{Math.round(zoom * 100)}%</span
      >
      <button
        type="button"
        onclick={() => setZoom(zoom * 2)}
        disabled={zoom >= MAX_ZOOM}
        aria-label="Zoom in">+</button
      >
    </div>
  </header>

  <p id={`${uid}-instructions`} class="visually-hidden">
    Click the timeline to seek. Drag empty space to pan. While zoomed, use the
    mouse wheel or trackpad to pan horizontally. Focus a cue or one of its
    boundary handles and use Left or Right Arrow to adjust it by one
    millisecond. Press Escape to cancel a pointer drag.
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
          {@const timing = displayedTiming(cue)}
          {@const cueLeft =
            timelineDurationUs > 0
              ? (timing.start_us / timelineDurationUs) * contentWidthPx
              : 0}
          {@const cueWidth =
            timelineDurationUs > 0
              ? ((timing.end_us - timing.start_us) / timelineDurationUs) *
                contentWidthPx
              : 0}
          <div
            class="cue-shell"
            class:selected={cue.id === selectedCueId}
            class:dragging={timingDrag?.original.id === cue.id}
            style:left={`${cueLeft}px`}
            style:width={`${Math.max(2, cueWidth)}px`}
            data-cue-id={cue.id}
          >
            <button
              class="cue-body"
              type="button"
              aria-label={`${cue.id === selectedCueId ? "Selected cue" : "Cue"} ${cueIndex + 1}, ${formatEditorTime(timing.start_us)} to ${formatEditorTime(timing.end_us)}. Drag to move; Arrow keys adjust by one millisecond.`}
              onpointerdown={(event) => beginTimingDrag(event, cue, "whole")}
              onpointermove={moveTimingDrag}
              onpointerup={finishTimingDrag}
              onpointercancel={cancelTimingDrag}
              onlostpointercapture={cancelTimingDrag}
              onkeydown={(event) => handleTimingKeydown(event, cue, "whole")}
              onclick={stopTimelineClick}
            >
              <span class="timeline-cue-number">{cueIndex + 1}</span>
              <span class="timeline-cue-text">{singleLine(cue.text)}</span>
            </button>
            <button
              class="cue-handle start"
              type="button"
              aria-label={`Adjust start of ${cue.id === selectedCueId ? "selected cue" : "cue"} ${cueIndex + 1}, currently ${formatEditorTime(timing.start_us)}. Arrow keys adjust by one millisecond.`}
              onpointerdown={(event) => beginTimingDrag(event, cue, "start")}
              onpointermove={moveTimingDrag}
              onpointerup={finishTimingDrag}
              onpointercancel={cancelTimingDrag}
              onlostpointercapture={cancelTimingDrag}
              onkeydown={(event) => handleTimingKeydown(event, cue, "start")}
              onclick={stopTimelineClick}
            ></button>
            <button
              class="cue-handle end"
              type="button"
              aria-label={`Adjust end of ${cue.id === selectedCueId ? "selected cue" : "cue"} ${cueIndex + 1}, currently ${formatEditorTime(timing.end_us)}. Arrow keys adjust by one millisecond.`}
              onpointerdown={(event) => beginTimingDrag(event, cue, "end")}
              onpointermove={moveTimingDrag}
              onpointerup={finishTimingDrag}
              onpointercancel={cancelTimingDrag}
              onlostpointercapture={cancelTimingDrag}
              onkeydown={(event) => handleTimingKeydown(event, cue, "end")}
              onclick={stopTimelineClick}
            ></button>
          </div>
        {/each}

        {#if timelineDurationUs > 0}
          <div
            class="playhead"
            style:left={`${(clampInteger(playbackUs, 0, timelineDurationUs) / timelineDurationUs) * contentWidthPx}px`}
            aria-hidden="true"
          >
            <span></span>
          </div>
        {/if}
      </div>
    </div>

    {#if timelineStatus}
      {#if timelineStatus.kind === "failure"}
        <div class="timeline-state failure" role="alert">
          <strong>Waveform unavailable</strong>
          <span>{timelineStatus.message}</span>
        </div>
      {:else}
        <div
          class="timeline-state"
          data-kind={timelineStatus.kind}
          role="status"
        >
          {#if timelineStatus.kind === "preparing"}<span class="state-pulse"
            ></span>{/if}
          <span>{timelineStatus.message}</span>
        </div>
      {/if}
    {/if}
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

  .timeline-toolbar {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding-inline: 0.65rem 0.4rem;
    border-block-end: 1px solid var(--waveform-border-soft);
    background: var(--waveform-raised);
  }

  .timeline-heading,
  .timeline-controls {
    display: flex;
    min-width: 0;
    align-items: center;
  }

  .timeline-heading {
    gap: 0.65rem;
  }

  .timeline-heading strong {
    color: var(--waveform-text-soft);
    font-size: 0.6875rem;
    font-weight: 650;
    letter-spacing: 0.025em;
    text-transform: uppercase;
  }

  .timeline-heading output,
  .zoom-value {
    color: var(--waveform-muted);
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 0.625rem;
    font-variant-numeric: tabular-nums;
  }

  .timeline-controls {
    gap: 0.2rem;
  }

  .timeline-controls button {
    min-width: 1.75rem;
    height: 1.6rem;
    border: 1px solid transparent;
    border-radius: 0.25rem;
    padding-inline: 0.42rem;
    background: transparent;
    color: var(--waveform-text-soft);
    cursor: pointer;
    font-size: 0.625rem;
    font-weight: 620;
  }

  .timeline-controls button:hover:not(:disabled) {
    border-color: var(--waveform-border);
    background: var(--waveform-hover);
    color: var(--waveform-text);
  }

  .timeline-controls button:focus-visible,
  .cue-body:focus-visible,
  .cue-handle:focus-visible {
    z-index: 8;
    outline: 2px solid var(--waveform-accent);
    outline-offset: -2px;
  }

  .timeline-controls button:disabled {
    color: color-mix(in srgb, var(--waveform-muted) 48%, transparent);
    cursor: not-allowed;
  }

  .zoom-value {
    width: 2.5rem;
    text-align: center;
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

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
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

  @media (max-width: 42rem) {
    .studio-waveform {
      height: 10.5rem;
    }

    .timeline-heading output,
    .zoom-value {
      display: none;
    }
  }
</style>
