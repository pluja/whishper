import type { AdapterManifest } from "@anysub/contracts";

export interface AvailableTranscriptionModel {
  key: string;
  adapterId: string;
  adapterName: string;
  modelId: string;
  displayName: string;
  description: string | null;
  optionsSchema: Record<string, unknown>;
}

export function availableTranscriptionModels(
  manifests: unknown[],
): AvailableTranscriptionModel[] {
  const models = new Map<string, AvailableTranscriptionModel>();
  for (const workerManifest of manifests) {
    if (!isRecord(workerManifest) || !Array.isArray(workerManifest.adapters))
      continue;
    for (const candidate of workerManifest.adapters) {
      if (!isAdapterManifest(candidate) || candidate.id === "builtin.fake")
        continue;
      for (const model of candidate.models) {
        if (!model.capabilities.includes("transcribe")) continue;
        const key = `${candidate.id}:${model.id}`;
        models.set(key, {
          key,
          adapterId: candidate.id,
          adapterName: candidate.displayName,
          modelId: model.id,
          displayName: model.displayName,
          description: model.description ?? null,
          optionsSchema: model.optionsSchema ?? {},
        });
      }
    }
  }
  return [...models.values()].sort((left, right) => {
    const preferred = [
      "tiny",
      "base",
      "small",
      "medium",
      "large-v3-turbo",
      "large-v3",
    ];
    const leftRank = preferred.indexOf(left.modelId);
    const rightRank = preferred.indexOf(right.modelId);
    if (left.adapterId === right.adapterId && leftRank !== rightRank) {
      return (
        (leftRank < 0 ? 999 : leftRank) - (rightRank < 0 ? 999 : rightRank)
      );
    }
    return `${left.adapterName} ${left.displayName}`.localeCompare(
      `${right.adapterName} ${right.displayName}`,
    );
  });
}

function isAdapterManifest(value: unknown): value is AdapterManifest {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.displayName === "string" &&
    Array.isArray(value.models) &&
    value.models.every(
      (model) =>
        isRecord(model) &&
        typeof model.id === "string" &&
        typeof model.displayName === "string" &&
        Array.isArray(model.capabilities),
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
