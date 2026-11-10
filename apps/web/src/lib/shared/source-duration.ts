import { clamp } from "./clamp";

// Zero stands for an unknown duration.
export function knownDurationUs(value: unknown): number {
  const durationUs = Number(value ?? 0);
  return Number.isSafeInteger(durationUs) && durationUs > 0 ? durationUs : 0;
}

// The probe measures the whole media, while a transcript's duration is its
// decoded audio stretched to cover every cue the worker returned. Either may be
// the longer one, and a cue may end anywhere within the longer.
export function maxCueEndUs(
  mediaDurationUs: unknown,
  trackDurationUs: unknown,
): number {
  return Math.max(
    knownDurationUs(mediaDurationUs),
    knownDurationUs(trackDurationUs),
  );
}

export function clampToDuration(
  microseconds: number,
  durationUs: number,
): number {
  return clamp(microseconds, 0, durationUs > 0 ? durationUs : Infinity);
}
