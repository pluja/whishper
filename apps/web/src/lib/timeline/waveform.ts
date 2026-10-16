import { MEDIA_PREPARATION_VERSION } from "@anysub/contracts";

import { isRecord } from "$lib/shared/is-record";

export type DecodedWaveformLevel = {
  samplesPerPeak: number;
  peaksPerSecond: number;
  length: number;
  peaks: Int8Array;
};

export type DecodedWaveform = {
  schemaVersion: typeof MEDIA_PREPARATION_VERSION;
  durationUs: number;
  sampleRate: number;
  channelMix: string;
  encoding: "signed-int8-min-max-base64";
  levels: readonly DecodedWaveformLevel[];
};

// Container and decoder durations of the same media routinely differ by a
// frame or two, so exact equality would reject valid waveforms.
const DURATION_TOLERANCE_US = 50_000;

const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function decodePeaks(data: string, expectedLength: number): Int8Array {
  if (
    data.length === 0 ||
    data.length % 4 !== 0 ||
    !BASE64_PATTERN.test(data)
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

function validateLevel(candidate: unknown): DecodedWaveformLevel {
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
  };
}

export function validateWaveform(value: unknown): DecodedWaveform {
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

  return {
    schemaVersion: MEDIA_PREPARATION_VERSION,
    durationUs: value.durationUs as number,
    sampleRate: value.sampleRate as number,
    channelMix: value.channelMix,
    encoding: "signed-int8-min-max-base64",
    levels: value.levels.map(validateLevel),
  };
}

export function waveformMatchesDuration(
  waveform: DecodedWaveform,
  durationUs: number,
): boolean {
  return Math.abs(waveform.durationUs - durationUs) <= DURATION_TOLERANCE_US;
}

export function chooseWaveformLevel(
  waveform: DecodedWaveform | null,
  targetPeaksPerSecond: number,
): DecodedWaveformLevel | null {
  if (!waveform || targetPeaksPerSecond <= 0) return null;

  let best = waveform.levels[0];
  let bestDistance = Math.abs(
    Math.log(best.peaksPerSecond / targetPeaksPerSecond),
  );
  for (const level of waveform.levels.slice(1)) {
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

export async function loadWaveform(
  url: string,
  signal: AbortSignal,
): Promise<DecodedWaveform> {
  const response = await fetch(url, { signal, credentials: "same-origin" });
  if (!response.ok) {
    throw new Error(`Waveform request failed with status ${response.status}.`);
  }
  return validateWaveform(await response.json());
}
