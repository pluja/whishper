import type { WorkerDevice } from "@anysub/contracts";

import type { WorkerStorageSpace } from "$lib/shared/model-inventory";

export type WorkerState = "busy" | "idle" | "offline";

export type WorkerJobSummary = {
  kind: "transcribe" | "media_prepare" | "model_cache";
  title: string;
  progress: number;
  message: string | null;
  projectId: string | null;
};

export type WorkerOverview = {
  id: string;
  name: string;
  version: string;
  architecture: string;
  state: WorkerState;
  lastSeenAt: Date;
  device: WorkerDevice | null;
  cpu: { model: string | null; cores: number } | null;
  memory: { totalBytes: number; availableBytes: number } | null;
  gpus: { name: string; totalMemoryBytes: number }[];
  storage: WorkerStorageSpace | null;
  downloadedModels: number;
  offeredModels: number;
  currentJob: WorkerJobSummary | null;
};
