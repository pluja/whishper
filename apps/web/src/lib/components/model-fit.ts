import type { BadgeTone } from "#lib/components/ui/variants.ts";
import type { ModelFit } from "#lib/shared/transcription-models.ts";

export const FIT_TONES: Record<ModelFit, BadgeTone> = {
  good: "success",
  caution: "warning",
  poor: "danger",
  unknown: "neutral",
};
