import type { EditorCue } from "$lib/editor/cues";

export type CueTiming = Pick<EditorCue, "id" | "start_us" | "end_us">;

export type TimingGesture = "drag" | "nudge";

export type TimingPart = "whole" | "start" | "end";

export type TimingBounds = { minUs: number; maxUs: number };

export function clampNumber(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function clampInteger(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.round(clampNumber(value, minimum, maximum));
}

export function cueIsValid(cue: CueTiming, durationUs: number): boolean {
  return (
    Number.isSafeInteger(cue.start_us) &&
    Number.isSafeInteger(cue.end_us) &&
    cue.start_us >= 0 &&
    cue.start_us <= cue.end_us &&
    cue.end_us <= durationUs
  );
}

// Cues already overlapping a neighbour keep their current extent, so grabbing
// one never makes it jump.
export function neighbourBounds(
  cues: readonly CueTiming[],
  index: number,
  durationUs: number,
): TimingBounds {
  const cue = cues[index];
  const previousEndUs = cues[index - 1]?.end_us ?? 0;
  const nextStartUs = cues[index + 1]?.start_us ?? durationUs;
  return {
    minUs: Math.min(previousEndUs, cue.start_us),
    maxUs: Math.max(nextStartUs, cue.end_us),
  };
}

export function dragBounds(
  neighbours: TimingBounds,
  durationUs: number,
  passNeighbours: boolean,
): TimingBounds {
  return passNeighbours ? { minUs: 0, maxUs: durationUs } : neighbours;
}

export function timingAfterDelta(
  original: CueTiming,
  part: TimingPart,
  deltaUs: number,
  bounds: TimingBounds,
): CueTiming {
  if (part === "whole") {
    const cueDurationUs = original.end_us - original.start_us;
    const start = clampInteger(
      original.start_us + deltaUs,
      bounds.minUs,
      Math.max(bounds.minUs, bounds.maxUs - cueDurationUs),
    );
    return { id: original.id, start_us: start, end_us: start + cueDurationUs };
  }
  if (part === "start") {
    return {
      id: original.id,
      start_us: clampInteger(
        original.start_us + deltaUs,
        bounds.minUs,
        original.end_us,
      ),
      end_us: original.end_us,
    };
  }
  return {
    id: original.id,
    start_us: original.start_us,
    end_us: clampInteger(
      original.end_us + deltaUs,
      original.start_us,
      bounds.maxUs,
    ),
  };
}

export function timeToPx(
  timeUs: number,
  durationUs: number,
  contentWidthPx: number,
): number {
  return durationUs > 0 ? (timeUs / durationUs) * contentWidthPx : 0;
}

export function pxToTime(
  px: number,
  durationUs: number,
  contentWidthPx: number,
): number {
  return contentWidthPx > 0
    ? Math.round((px / contentWidthPx) * durationUs)
    : 0;
}

type ScrollGeometry = {
  durationUs: number;
  contentWidthPx: number;
  viewportWidthPx: number;
};

function maxScrollLeft(geometry: ScrollGeometry): number {
  return Math.max(0, geometry.contentWidthPx - geometry.viewportWidthPx);
}

export function scrollLeftCentredOn(
  timeUs: number,
  geometry: ScrollGeometry,
): number {
  return clampNumber(
    timeToPx(timeUs, geometry.durationUs, geometry.contentWidthPx) -
      geometry.viewportWidthPx / 2,
    0,
    maxScrollLeft(geometry),
  );
}

// Scrolls only as far as needed to keep the playhead a few pixels inside the
// visible edge, so steady playback pages smoothly instead of re-centring.
export function scrollLeftRevealing(
  timeUs: number,
  scrollLeft: number,
  gutterPx: number,
  geometry: ScrollGeometry,
): number {
  const { durationUs, contentWidthPx, viewportWidthPx } = geometry;
  const limit = maxScrollLeft(geometry);
  const current = clampNumber(scrollLeft, 0, limit);
  const gutter = Math.min(gutterPx, viewportWidthPx / 2);
  const playheadX = timeToPx(
    clampInteger(timeUs, 0, durationUs),
    durationUs,
    contentWidthPx,
  );
  let target = current;
  if (playheadX <= current + gutter) {
    target = playheadX - gutter;
  } else if (playheadX >= current + viewportWidthPx - gutter) {
    target = playheadX - viewportWidthPx + gutter;
  }
  return clampNumber(target, 0, limit);
}
