import type { ModelCacheAction, ModelCacheJobPayload } from "@anysub/contracts";
import { and, eq } from "drizzle-orm";

import { jobs } from "$lib/server/db/schema";
import { withTransaction } from "$lib/server/db/transaction";
import { conflict, notFound } from "$lib/server/http/errors";
import { isActiveJob } from "$lib/server/jobs/predicates";
import { workerModelInventories } from "$lib/server/models/inventory";
import { formatBytes } from "$lib/shared/format";

// Ahead of transcriptions, so a download someone waits for starts next.
const MODEL_JOB_PRIORITY = 10;

export type ModelTaskRequest = {
  workerId: string;
  adapterId: string;
  modelId: string;
  action: ModelCacheAction;
};

export function requestModelTask(request: ModelTaskRequest): void {
  const { workerId, adapterId, modelId, action } = request;
  withTransaction((tx) => {
    const worker = workerModelInventories(tx).find(
      (inventory) => inventory.workerId === workerId,
    );
    if (!worker) throw conflict("That worker is no longer connected.");
    if (!worker.manageable) {
      throw conflict(
        `${worker.name} cannot download or remove models. Update the worker to the latest version.`,
      );
    }
    const model = worker.models.find(
      (candidate) =>
        candidate.adapterId === adapterId && candidate.modelId === modelId,
    );
    if (!model) throw notFound(`${worker.name} does not offer that model.`);
    if (model.task) {
      throw conflict(`${model.displayName} is already being updated.`);
    }
    if (action === "download" && model.downloaded === true) {
      throw conflict(`${model.displayName} is already downloaded.`);
    }
    if (action === "delete" && model.downloaded !== true) {
      throw conflict(`${model.displayName} is not downloaded.`);
    }
    const available = worker.storage?.availableBytes;
    if (
      action === "download" &&
      model.downloadSizeBytes !== null &&
      available !== undefined &&
      model.downloadSizeBytes > available
    ) {
      throw conflict(
        `${model.displayName} needs ${formatBytes(model.downloadSizeBytes)}, but only ${formatBytes(available)} is free on ${worker.name}.`,
      );
    }

    const payload: ModelCacheJobPayload = {
      kind: "model_cache",
      action,
      workerId,
      adapterId,
      modelId,
    };
    tx.insert(jobs)
      .values({
        kind: "model_cache",
        payload,
        priority: MODEL_JOB_PRIORITY,
        // Removing files either works or needs a person to look.
        maxAttempts: action === "download" ? 3 : 1,
      })
      .run();
  });
}

export function cancelModelTask(jobId: string): boolean {
  return withTransaction(
    (tx) =>
      tx
        .update(jobs)
        .set({
          state: "cancelled",
          leaseTokenHash: null,
          leaseExpiresAt: null,
          progressMessage: "Cancelled",
        })
        .where(
          and(eq(jobs.id, jobId), eq(jobs.kind, "model_cache"), isActiveJob),
        )
        .returning({ id: jobs.id })
        .all().length > 0,
  );
}
