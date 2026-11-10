export type ModelFit = "good" | "caution" | "poor" | "unknown";

export type AvailableTranscriptionModel = {
  key: string;
  adapterId: string;
  adapterName: string;
  modelId: string;
  displayName: string;
  description: string | null;
  parameterCount: number | null;
  requiredVramBytes: number | null;
  recommendedRamBytes: number | null;
  downloadSizeBytes: number | null;
  downloaded: boolean | null;
  recommended: boolean;
  memoryRequirementBytes: number | null;
  memoryRequirementKind: "ram" | "vram" | null;
  optionsSchema: Record<string, unknown>;
  fit: ModelFit;
  fitLabel: string;
  fitReason: string;
  workerSummary: string;
};

export type DetectedWorkerHardware = {
  kind: "cpu" | "gpu";
  name: string;
  details: string[];
};

export function defaultModelKey(
  models: AvailableTranscriptionModel[],
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
