import type { ModelCacheAction } from "@anysub/contracts";

import type {
  DetectedWorkerHardware,
  ModelFit,
} from "$lib/shared/transcription-models";

export type ModelTask = {
  jobId: string;
  action: ModelCacheAction;
  // A queued task waits for the worker to finish its current job.
  started: boolean;
  progress: number;
};

export type InventoryModel = {
  key: string;
  adapterId: string;
  adapterName: string;
  modelId: string;
  displayName: string;
  description: string | null;
  parameterCount: number | null;
  downloadSizeBytes: number | null;
  memoryRequirementBytes: number | null;
  memoryRequirementKind: "ram" | "vram" | null;
  fit: ModelFit;
  fitLabel: string;
  fitReason: string;
  recommended: boolean;
  downloaded: boolean | null;
  task: ModelTask | null;
  // The message of the last download or removal, when it failed.
  failure: string | null;
};

export type WorkerStorageSpace = {
  totalBytes: number;
  availableBytes: number;
};

export type WorkerModelInventory = {
  workerId: string;
  name: string;
  hardware: DetectedWorkerHardware | null;
  storage: WorkerStorageSpace | null;
  manageable: boolean;
  models: InventoryModel[];
};
