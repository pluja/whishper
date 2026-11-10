import { DEFAULT_MAX_LINE_LENGTH } from "./limits";

export const PRECISIONS = ["auto", "memory", "precise"] as const;
export type Precision = (typeof PRECISIONS)[number];

export const AUTOMATIC_MODEL = "auto";
export const CUSTOM_UPLOAD_LIMIT = "custom";

export const MIN_LINE_LENGTH = 20;
export const MAX_LINE_LENGTH = 120;

export const GIB = 1024 ** 3;
export const DEFAULT_MAX_UPLOAD_BYTES = 500 * GIB;
export const MIN_UPLOAD_LIMIT_GIB = 1;
export const MAX_UPLOAD_LIMIT_GIB = 10 * 1024;
export const UPLOAD_LIMIT_PRESETS_GIB = [5, 25, 100, 500, 2048] as const;

export type TranscriptionDefaults = {
  // "adapterId:modelId", or null for the best fit for the connected hardware.
  model: string | null;
  // null detects the spoken language.
  language: string | null;
  alignment: boolean;
  maxLineLength: number;
  precision: Precision;
};

export type InstanceSettings = TranscriptionDefaults & {
  maxUploadBytes: number;
};

export const DEFAULT_INSTANCE_SETTINGS: InstanceSettings = {
  model: null,
  language: null,
  alignment: true,
  maxLineLength: DEFAULT_MAX_LINE_LENGTH,
  precision: "auto",
  maxUploadBytes: DEFAULT_MAX_UPLOAD_BYTES,
};

// Mirrors the worker's table. CTranslate2 cannot run half-precision floats on
// a processor, so lower memory there keeps the automatic int8 weights.
export const PRECISION_COMPUTE_TYPES: Record<
  Precision,
  Record<"cpu" | "cuda", string>
> = {
  auto: { cpu: "int8", cuda: "float16" },
  memory: { cpu: "int8", cuda: "int8_float16" },
  precise: { cpu: "float32", cuda: "float32" },
};

// Scales the worker's memory estimates, which assume the automatic weights.
// One factor covers both devices, and lower memory saves nothing on a
// processor, so only full precision changes the estimate.
export const PRECISION_MEMORY_FACTORS: Record<Precision, number> = {
  auto: 1,
  memory: 1,
  precise: 2,
};

export function isPrecision(value: string): value is Precision {
  return (PRECISIONS as readonly string[]).includes(value);
}
