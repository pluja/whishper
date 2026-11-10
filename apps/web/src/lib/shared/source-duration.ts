import { clamp } from "./clamp";

// Zero stands for an unknown duration.
export function knownDurationUs(value: unknown): number {
  const durationUs = Number(value ?? 0);
  return Number.isSafeInteger(durationUs) && durationUs > 0 ? durationUs : 0;
}

export function clampToDuration(
  microseconds: number,
  durationUs: number,
): number {
  return clamp(microseconds, 0, durationUs > 0 ? durationUs : Infinity);
}
