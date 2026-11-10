import type { ModelCacheAction } from "@anysub/contracts";

import type {
  DetectedWorkerHardware,
  TranscriptionModel,
} from "$lib/shared/transcription-models";

export type ModelTask = {
  jobId: string;
  action: ModelCacheAction;
  // A queued task waits for the worker to finish its current job.
  started: boolean;
  progress: number;
};

export type InventoryModel = TranscriptionModel & {
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
