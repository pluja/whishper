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
  downloaded: boolean | null;
  optionsSchema: Record<string, unknown>;
  fit: ModelFit;
  fitLabel: string;
  fitReason: string;
  workerSummary: string;
}

export interface DetectedWorkerHardware {
  kind: "cpu" | "gpu";
  name: string;
  details: string[];
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
          downloaded:
            typeof model.downloaded === "boolean" ? model.downloaded : null,
          optionsSchema: model.optionsSchema ?? {},
          ...fit,
        };
        const current = models.get(key);
        if (!current) {
          models.set(key, available);
          continue;
        }
        const downloaded = mergeDownloadedState(
          current.downloaded,
          available.downloaded,
        );
        if (FIT_RANK[available.fit] > FIT_RANK[current.fit]) {
          models.set(key, { ...available, downloaded });
        } else if (downloaded !== current.downloaded) {
          models.set(key, { ...current, downloaded });
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

export function detectedWorkerHardware(
  manifests: unknown[],
): DetectedWorkerHardware[] {
  const devices = new Map<string, DetectedWorkerHardware>();
  for (const manifest of manifests) {
    if (!isRecord(manifest) || !isWorkerHardware(manifest.hardware)) continue;
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
      fitLabel: "Not checked",
      fitReason: "Hardware details are unavailable.",
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
        fitLabel: "Not recommended",
        fitReason: "This worker has no usable graphics card.",
        workerSummary,
      };
    }
    const requiredVram = positiveNumber(model.requiredVramBytes);
    if (!requiredVram) {
      return {
        fit: "unknown",
        fitLabel: "Not checked",
        fitReason: "No graphics memory estimate is available for this model.",
        workerSummary,
      };
    }
    if (gpu.totalMemoryBytes >= requiredVram) {
      return {
        fit: "good",
        fitLabel: "Runs well",
        fitReason: "Your graphics card has enough memory for this model.",
        workerSummary,
      };
    }
    if (gpu.totalMemoryBytes >= requiredVram * 0.75) {
      return {
        fit: "caution",
        fitLabel: "May be slow",
        fitReason: "This model is close to your graphics card's memory limit.",
        workerSummary,
      };
    }
    return {
      fit: "poor",
      fitLabel: "Not recommended",
      fitReason: `This model needs about ${formatMemory(requiredVram)} of graphics memory, but only ${formatMemory(gpu.totalMemoryBytes)} is available.`,
      workerSummary,
    };
  }

  const recommendedRam = positiveNumber(model.recommendedRamBytes);
  if (!recommendedRam) {
    return {
      fit: "unknown",
      fitLabel: "Not checked",
      fitReason: "No memory estimate is available for this model.",
      workerSummary,
    };
  }
  if (availableRam < recommendedRam) {
    return {
      fit: "poor",
      fitLabel: "Not recommended",
      fitReason: `This model needs about ${formatMemory(recommendedRam)} of memory, but only ${formatMemory(availableRam)} is available.`,
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
      fitLabel: "May be slow",
      fitReason:
        "This computer has enough memory, but this model will be much faster with a supported graphics card.",
      workerSummary,
    };
  }
  return {
    fit: "good",
    fitLabel: "Runs well",
    fitReason: "This computer has enough memory for this model.",
    workerSummary,
  };
}

function formatWorkerSummary(
  workerName: string,
  hardware: WorkerHardware,
): string {
  const detected = describeHardware(hardware);
  return `${workerName} · ${detected.name} · ${detected.details.join(" · ")}`;
}

function describeHardware(hardware: WorkerHardware): DetectedWorkerHardware {
  const ram = `${formatMemory(hardware.memory.availableBytes)} RAM available`;
  if (hardware.device === "cuda" && hardware.gpus[0]) {
    const gpu = hardware.gpus[0];
    return {
      kind: "gpu",
      name: gpu.name,
      details: [`${formatMemory(gpu.totalMemoryBytes)} VRAM`, ram],
    };
  }
  return {
    kind: "cpu",
    name: hardware.cpu.model ?? "CPU",
    details: [`${hardware.cpu.logicalCores} logical cores`, ram],
  };
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
