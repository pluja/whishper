import type {
  AdapterManifest,
  AdapterModel,
  WorkerHardware,
  WorkerManifest,
} from "@anysub/contracts";

import { formatBytes } from "$lib/shared/format";
import {
  modelKey,
  type AvailableTranscriptionModel,
  type DetectedWorkerHardware,
  type ModelFit,
  type TranscriptionModel,
} from "$lib/shared/transcription-models";

const FIT_RANK: Record<ModelFit, number> = {
  poor: 0,
  unknown: 1,
  caution: 2,
  good: 3,
};

export function availableTranscriptionModels(
  manifests: WorkerManifest[],
): AvailableTranscriptionModel[] {
  const models = new Map<string, AvailableTranscriptionModel>();
  for (const manifest of manifests) {
    for (const adapter of manifest.adapters) {
      for (const model of adapter.models) {
        if (!model.capabilities.includes("transcribe")) continue;
        const available: AvailableTranscriptionModel = {
          ...describeModel(adapter, model, manifest.hardware),
          optionsSchema: model.optionsSchema,
        };
        const current = models.get(available.key);
        if (!current) {
          models.set(available.key, available);
          continue;
        }
        const downloaded = mergeDownloadedState(
          current.downloaded,
          available.downloaded,
        );
        if (FIT_RANK[available.fit] > FIT_RANK[current.fit]) {
          models.set(available.key, { ...available, downloaded });
        } else if (downloaded !== current.downloaded) {
          models.set(available.key, { ...current, downloaded });
        }
      }
    }
  }
  return [...models.values()].sort(compareModels);
}

export function describeModel(
  adapter: AdapterManifest,
  model: AdapterModel,
  hardware: WorkerHardware | null,
): TranscriptionModel {
  const fit = scoreModelFit(model, hardware);
  return {
    key: modelKey(adapter.id, model.id),
    adapterId: adapter.id,
    adapterName: adapter.displayName,
    modelId: model.id,
    displayName: model.displayName,
    description: model.description,
    parameterCount: model.parameterCount,
    downloadSizeBytes: model.downloadSizeBytes,
    downloaded: model.downloaded,
    recommended: isRecommended(model, fit.fit),
    ...fit,
  };
}

const PREFERRED_ORDER = [
  "tiny",
  "base",
  "small",
  "medium",
  "large-v3-turbo",
  "large-v3",
];

type SortableModel = {
  adapterId: string;
  adapterName: string;
  modelId: string;
  displayName: string;
};

export function compareModels(
  left: SortableModel,
  right: SortableModel,
): number {
  const leftRank = PREFERRED_ORDER.indexOf(left.modelId);
  const rightRank = PREFERRED_ORDER.indexOf(right.modelId);
  if (left.adapterId === right.adapterId && leftRank !== rightRank) {
    return (leftRank < 0 ? 999 : leftRank) - (rightRank < 0 ? 999 : rightRank);
  }
  return `${left.adapterName} ${left.displayName}`.localeCompare(
    `${right.adapterName} ${right.displayName}`,
  );
}

function isRecommended(model: AdapterModel, fit: ModelFit): boolean {
  return model.id === "large-v3-turbo" && fit === "good";
}

export function detectedWorkerHardware(
  manifests: WorkerManifest[],
): DetectedWorkerHardware[] {
  const devices = new Map<string, DetectedWorkerHardware>();
  for (const manifest of manifests) {
    if (!manifest.hardware) continue;
    const detected = describeHardware(manifest.hardware);
    devices.set(JSON.stringify(detected), detected);
  }
  return [...devices.values()];
}

function mergeDownloadedState(
  left: boolean | null,
  right: boolean | null,
): boolean | null {
  if (left === true || right === true) return true;
  if (left === false || right === false) return false;
  return null;
}

type ModelFitScore = Pick<
  TranscriptionModel,
  | "fit"
  | "fitLabel"
  | "fitReason"
  | "memoryRequirementBytes"
  | "memoryRequirementKind"
>;

function scoreModelFit(
  model: AdapterModel,
  hardware: WorkerHardware | null,
): ModelFitScore {
  if (!hardware) {
    return {
      fit: "unknown",
      fitLabel: "Not checked",
      fitReason: "Hardware details are unavailable.",
      memoryRequirementBytes: null,
      memoryRequirementKind: null,
    };
  }

  const availableRam = hardware.memory.availableBytes;
  const memoryRequirementKind: "ram" | "vram" =
    hardware.device === "cuda" ? "vram" : "ram";
  const memoryRequirementBytes =
    hardware.device === "cuda"
      ? model.requiredVramBytes
      : model.recommendedRamBytes;
  const resource = { memoryRequirementBytes, memoryRequirementKind };

  if (hardware.device === "cuda") {
    const gpu = hardware.gpus[0];
    if (!gpu) {
      return {
        ...resource,
        fit: "poor",
        fitLabel: "Not recommended",
        fitReason: "This worker has no usable graphics card.",
      };
    }
    if (!memoryRequirementBytes) {
      return {
        ...resource,
        fit: "unknown",
        fitLabel: "Not checked",
        fitReason: "No graphics memory estimate is available for this model.",
      };
    }
    if (gpu.totalMemoryBytes >= memoryRequirementBytes) {
      return {
        ...resource,
        fit: "good",
        fitLabel: "Runs well",
        fitReason: "Your graphics card has enough memory for this model.",
      };
    }
    if (gpu.totalMemoryBytes >= memoryRequirementBytes * 0.75) {
      return {
        ...resource,
        fit: "caution",
        fitLabel: "May be slow",
        fitReason: "This model is close to your graphics card's memory limit.",
      };
    }
    return {
      ...resource,
      fit: "poor",
      fitLabel: "Not recommended",
      fitReason: `This model needs about ${formatBytes(memoryRequirementBytes)} of graphics memory, but only ${formatBytes(gpu.totalMemoryBytes)} is available.`,
    };
  }

  if (!memoryRequirementBytes) {
    return {
      ...resource,
      fit: "unknown",
      fitLabel: "Not checked",
      fitReason: "No memory estimate is available for this model.",
    };
  }
  if (availableRam < memoryRequirementBytes) {
    return {
      ...resource,
      fit: "poor",
      fitLabel: "Not recommended",
      fitReason: `This model needs about ${formatBytes(memoryRequirementBytes)} of memory, but only ${formatBytes(availableRam)} is available.`,
    };
  }
  if (
    model.id === "medium" ||
    model.id.startsWith("large") ||
    model.id === "turbo"
  ) {
    return {
      ...resource,
      fit: "caution",
      fitLabel: "May be slow",
      fitReason:
        "This computer has enough memory, but this model will be much faster with a supported graphics card.",
    };
  }
  return {
    ...resource,
    fit: "good",
    fitLabel: "Runs well",
    fitReason: "This computer has enough memory for this model.",
  };
}

export function describeHardware(
  hardware: WorkerHardware,
): DetectedWorkerHardware {
  const ram = `${formatBytes(hardware.memory.availableBytes)} RAM available`;
  if (hardware.device === "cuda" && hardware.gpus[0]) {
    const gpu = hardware.gpus[0];
    return {
      kind: "gpu",
      name: gpu.name,
      details: [`${formatBytes(gpu.totalMemoryBytes)} VRAM`, ram],
    };
  }
  return {
    kind: "cpu",
    name: hardware.cpu.model ?? "CPU",
    details: [`${hardware.cpu.logicalCores} logical cores`, ram],
  };
}
