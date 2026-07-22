import type {
  AdapterManifest,
  AdapterModel,
  WorkerHardware,
} from "@anysub/contracts";

export type ModelFit = "good" | "caution" | "poor" | "unknown";

export interface AvailableTranscriptionModel {
  key: string;
  adapterId: string;
  adapterName: string;
  modelId: string;
  displayName: string;
  description: string | null;
  parameterCount: number | null;
  requiredVramBytes: number | null;
  recommendedRamBytes: number | null;
  optionsSchema: Record<string, unknown>;
  fit: ModelFit;
  fitLabel: string;
  fitReason: string;
  workerSummary: string;
}

const GIB = 1024 ** 3;
const FIT_RANK: Record<ModelFit, number> = {
  poor: 0,
  unknown: 1,
  caution: 2,
  good: 3,
};

export function availableTranscriptionModels(
  manifests: unknown[],
): AvailableTranscriptionModel[] {
  const models = new Map<string, AvailableTranscriptionModel>();
  for (const workerManifest of manifests) {
    if (!isRecord(workerManifest) || !Array.isArray(workerManifest.adapters))
      continue;
    const workerName =
      typeof workerManifest.name === "string" ? workerManifest.name : "Worker";
    const hardware = isWorkerHardware(workerManifest.hardware)
      ? workerManifest.hardware
      : null;
    for (const candidate of workerManifest.adapters) {
      if (!isAdapterManifest(candidate) || candidate.id === "builtin.fake")
        continue;
      for (const model of candidate.models) {
        if (!model.capabilities.includes("transcribe")) continue;
        const key = `${candidate.id}:${model.id}`;
        const fit = scoreModelFit(model, workerName, hardware);
        const available: AvailableTranscriptionModel = {
          key,
          adapterId: candidate.id,
          adapterName: candidate.displayName,
          modelId: model.id,
          displayName: model.displayName,
          description: model.description ?? null,
          parameterCount: positiveNumber(model.parameterCount),
          requiredVramBytes: positiveNumber(model.requiredVramBytes),
          recommendedRamBytes: positiveNumber(model.recommendedRamBytes),
          optionsSchema: model.optionsSchema ?? {},
          ...fit,
        };
        const current = models.get(key);
        if (!current || FIT_RANK[available.fit] > FIT_RANK[current.fit]) {
          models.set(key, available);
        }
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

function scoreModelFit(
  model: AdapterModel,
  workerName: string,
  hardware: WorkerHardware | null,
): Pick<
  AvailableTranscriptionModel,
  "fit" | "fitLabel" | "fitReason" | "workerSummary"
> {
  if (!hardware) {
    return {
      fit: "unknown",
      fitLabel: "Fit unknown",
      fitReason: "This worker does not report hardware inventory yet.",
      workerSummary: workerName,
    };
  }

  const availableRam = hardware.memory.availableBytes;
  const workerSummary = formatWorkerSummary(workerName, hardware);
  if (hardware.device === "cuda") {
    const gpu = hardware.gpus[0];
    if (!gpu) {
      return {
        fit: "poor",
        fitLabel: "Poor fit",
        fitReason:
          "The worker is configured for CUDA but reports no usable GPU.",
        workerSummary,
      };
    }
    const requiredVram = positiveNumber(model.requiredVramBytes);
    if (!requiredVram) {
      return {
        fit: "unknown",
        fitLabel: "Fit unknown",
        fitReason: "This adapter does not publish a VRAM estimate.",
        workerSummary,
      };
    }
    if (gpu.totalMemoryBytes >= requiredVram) {
      return {
        fit: "good",
        fitLabel: "Good fit",
        fitReason: `Requires about ${formatMemory(requiredVram)} VRAM; ${formatMemory(gpu.totalMemoryBytes)} is available.`,
        workerSummary,
      };
    }
    if (gpu.totalMemoryBytes >= requiredVram * 0.75) {
      return {
        fit: "caution",
        fitLabel: "Use with caution",
        fitReason: `Close to the ${formatMemory(requiredVram)} VRAM estimate. Use int8 and a smaller batch size.`,
        workerSummary,
      };
    }
    return {
      fit: "poor",
      fitLabel: "Poor fit",
      fitReason: `Requires about ${formatMemory(requiredVram)} VRAM; this GPU reports ${formatMemory(gpu.totalMemoryBytes)}.`,
      workerSummary,
    };
  }

  const recommendedRam = positiveNumber(model.recommendedRamBytes);
  if (!recommendedRam) {
    return {
      fit: "unknown",
      fitLabel: "Fit unknown",
      fitReason: "This adapter does not publish a system RAM estimate.",
      workerSummary,
    };
  }
  if (availableRam < recommendedRam) {
    return {
      fit: "poor",
      fitLabel: "Poor fit",
      fitReason: `Needs about ${formatMemory(recommendedRam)} RAM; this worker reports ${formatMemory(availableRam)} available.`,
      workerSummary,
    };
  }
  if (
    model.id === "medium" ||
    model.id.startsWith("large") ||
    model.id === "turbo"
  ) {
    return {
      fit: "caution",
      fitLabel: "Use with caution",
      fitReason: `Memory fits, but ${model.displayName} can be slow on CPU. A GPU worker is recommended.`,
      workerSummary,
    };
  }
  return {
    fit: "good",
    fitLabel: "Good fit",
    fitReason: `Fits the ${formatMemory(availableRam)} RAM currently available to this CPU worker.`,
    workerSummary,
  };
}

function formatWorkerSummary(
  workerName: string,
  hardware: WorkerHardware,
): string {
  const ram = `${formatMemory(hardware.memory.availableBytes)} RAM available`;
  if (hardware.device === "cuda" && hardware.gpus[0]) {
    const gpu = hardware.gpus[0];
    return `${workerName} · ${gpu.name} · ${formatMemory(gpu.totalMemoryBytes)} VRAM · ${ram}`;
  }
  const cpu = hardware.cpu.model ?? "CPU";
  return `${workerName} · ${cpu} · ${hardware.cpu.logicalCores} cores · ${ram}`;
}

function formatMemory(bytes: number): string {
  const gib = bytes / GIB;
  const precision = gib >= 10 || Number.isInteger(gib) ? 0 : 1;
  return `${gib.toFixed(precision)} GB`;
}

function positiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
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

function isWorkerHardware(value: unknown): value is WorkerHardware {
  return (
    isRecord(value) &&
    (value.device === "cpu" || value.device === "cuda") &&
    typeof value.computeType === "string" &&
    isRecord(value.cpu) &&
    typeof value.cpu.logicalCores === "number" &&
    isRecord(value.memory) &&
    typeof value.memory.totalBytes === "number" &&
    typeof value.memory.availableBytes === "number" &&
    Array.isArray(value.gpus)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
