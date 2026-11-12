import {
  MODEL_CACHE_VERSION,
  type ModelCacheJobPayload,
  type WorkerManifest,
} from "@anysub/contracts";
import { desc, eq } from "drizzle-orm";

import type { Executor } from "#lib/server/db/index.ts";
import { jobs } from "#lib/server/db/schema.ts";
import { readInstanceSettings } from "#lib/server/settings/instance.ts";
import {
  compareModels,
  describeHardware,
  describeModel,
} from "#lib/server/transcription/models.ts";
import { activeWorkerManifests } from "#lib/server/workers/presence.ts";
import type { Precision } from "#lib/shared/instance-settings.ts";
import type {
  InventoryModel,
  ModelTask,
  WorkerModelInventory,
} from "#lib/shared/model-inventory.ts";
import { modelKey } from "#lib/shared/transcription-models.ts";

// Enough history to find the latest outcome for every model on every worker.
const RECENT_MODEL_JOBS = 500;

type LatestModelJob = {
  task: ModelTask | null;
  failure: string | null;
};

export function workerModelInventories(
  executor: Executor,
): WorkerModelInventory[] {
  const latest = latestModelJobs(executor);
  const { precision } = readInstanceSettings(executor);
  return activeWorkerManifests(executor)
    .map((manifest) => inventoryFor(manifest, latest, precision))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function taskKey(workerId: string, adapterId: string, modelId: string): string {
  return `${workerId}/${modelKey(adapterId, modelId)}`;
}

function inventoryFor(
  manifest: WorkerManifest,
  latest: Map<string, LatestModelJob>,
  precision: Precision,
): WorkerModelInventory {
  const { hardware } = manifest;
  const models: InventoryModel[] = [];
  for (const adapter of manifest.adapters) {
    for (const model of adapter.models) {
      if (!model.capabilities.includes("transcribe")) continue;
      const outcome = latest.get(
        taskKey(manifest.workerId, adapter.id, model.id),
      );
      models.push({
        ...describeModel(adapter, model, hardware, precision),
        task: outcome?.task ?? null,
        failure: outcome?.failure ?? null,
      });
    }
  }
  return {
    workerId: manifest.workerId,
    name: manifest.name,
    hardware: hardware ? describeHardware(hardware) : null,
    storage: manifest.modelStorage,
    manageable: manifest.capabilities.modelCache === MODEL_CACHE_VERSION,
    models: models.sort(compareModels),
  };
}

// Jobs arrive newest first, so the first one seen for a model is its outcome.
function latestModelJobs(executor: Executor): Map<string, LatestModelJob> {
  const rows = executor
    .select({
      id: jobs.id,
      state: jobs.state,
      payload: jobs.payload,
      progress: jobs.progress,
      error: jobs.error,
    })
    .from(jobs)
    .where(eq(jobs.kind, "model_cache"))
    .orderBy(desc(jobs.createdAt))
    .limit(RECENT_MODEL_JOBS)
    .all();
  const latest = new Map<string, LatestModelJob>();
  for (const row of rows) {
    const payload = row.payload as ModelCacheJobPayload;
    const key = taskKey(payload.workerId, payload.adapterId, payload.modelId);
    if (latest.has(key)) continue;
    const active = row.state === "queued" || row.state === "leased";
    latest.set(key, {
      task: active
        ? {
            jobId: row.id,
            action: payload.action,
            started: row.state === "leased",
            progress: row.progress,
          }
        : null,
      failure: row.state === "failed" ? (row.error?.message ?? null) : null,
    });
  }
  return latest;
}
