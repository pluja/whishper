import { isRecord } from "#lib/shared/is-record.ts";
import type { ProviderBrand } from "#lib/shared/provider-brands.ts";

export type ModelFit = "good" | "caution" | "poor" | "unknown";

// The worker protocol's adapter ID for models on a remote speech API, which
// no installed adapter may use.
export const REMOTE_ADAPTER_ID = "remote";

export type RemoteModelDetails = {
  providerName: string;
  brand: ProviderBrand | null;
  // Where the audio goes, shown so nobody sends it there by accident.
  host: string;
  priceMicrosPerMinute: number | null;
};

export type TranscriptionModel = {
  key: string;
  adapterId: string;
  adapterName: string;
  modelId: string;
  displayName: string;
  description: string | null;
  parameterCount: number | null;
  downloadSizeBytes: number | null;
  downloaded: boolean | null;
  recommended: boolean;
  memoryRequirementBytes: number | null;
  memoryRequirementKind: "ram" | "vram" | null;
  fit: ModelFit;
  fitLabel: string;
  fitReason: string;
  remote: RemoteModelDetails | null;
};

export type AvailableTranscriptionModel = TranscriptionModel & {
  optionsSchema: Record<string, unknown>;
};

export type DetectedWorkerHardware = {
  kind: "cpu" | "gpu";
  name: string;
  details: string[];
};

export function modelKey(adapterId: string, modelId: string): string {
  return `${adapterId}:${modelId}`;
}

export function parseModelKey(
  key: string,
): { adapterId: string; modelId: string } | null {
  const separator = key.indexOf(":");
  if (separator < 1 || separator === key.length - 1) return null;
  return {
    adapterId: key.slice(0, separator),
    modelId: key.slice(separator + 1),
  };
}

export function defaultModelKey(
  models: Pick<TranscriptionModel, "key" | "modelId" | "recommended">[],
  preferredKey: string | null = null,
): string {
  return (
    (
      models.find((model) => model.key === preferredKey) ??
      models.find((model) => model.recommended) ??
      models.find((model) => model.modelId === "small") ??
      models[0]
    )?.key ?? ""
  );
}

export function acceptsOption(
  optionsSchema: Record<string, unknown>,
  name: string,
): boolean {
  return isRecord(optionsSchema.properties) && name in optionsSchema.properties;
}
