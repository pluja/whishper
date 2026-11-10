import { randomUUID } from "node:crypto";

import {
  MODEL_CACHE_VERSION,
  type AdapterModel,
  type WorkerManifest,
} from "@anysub/contracts";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "$lib/server/db";
import { jobs } from "$lib/server/db/schema";
import { completeJob } from "$lib/server/jobs/completion";
import { failJob } from "$lib/server/jobs/failure";
import { leaseJob, reportProgress } from "$lib/server/jobs/lease";
import { workerModelInventories } from "$lib/server/models/inventory";
import { cancelModelTask, requestModelTask } from "$lib/server/models/tasks";
import { recordWorkerPresence } from "$lib/server/workers/presence";

const GIB = 1024 ** 3;

function model(
  id: string,
  overrides: Partial<AdapterModel> = {},
): AdapterModel {
  return {
    id,
    displayName: id.toUpperCase(),
    capabilities: ["transcribe", "align"],
    languages: "all",
    description: null,
    parameterCount: null,
    requiredVramBytes: null,
    recommendedRamBytes: GIB,
    downloadSizeBytes: GIB,
    downloaded: false,
    optionsSchema: {},
    ...overrides,
  };
}

function connectWorker(
  overrides: Partial<WorkerManifest> = {},
  models: AdapterModel[] = [
    model("small"),
    model("tiny", { downloaded: true }),
  ],
): WorkerManifest {
  const manifest: WorkerManifest = {
    protocolVersion: "1.0",
    workerId: randomUUID(),
    name: "local-worker",
    version: "1.0.0",
    architecture: "x86_64",
    capabilities: { mediaPreparation: null, modelCache: MODEL_CACHE_VERSION },
    adapters: [
      {
        protocolVersion: "1.0",
        id: "whisperx",
        displayName: "WhisperX",
        version: "1.0.0",
        description: null,
        models,
      },
    ],
    hardware: null,
    modelStorage: { totalBytes: 100 * GIB, availableBytes: 50 * GIB },
    ...overrides,
  };
  recordWorkerPresence(db, manifest);
  return manifest;
}

function inventoryModel(workerId: string, modelId: string) {
  return workerModelInventories(db)
    .find((worker) => worker.workerId === workerId)
    ?.models.find((candidate) => candidate.modelId === modelId);
}

function download(workerId: string, modelId = "small") {
  requestModelTask({
    workerId,
    adapterId: "whisperx",
    modelId,
    action: "download",
  });
}

describe("model downloads", () => {
  it("queue ahead of transcriptions and show as waiting", () => {
    const worker = connectWorker();

    download(worker.workerId);

    expect(db.select({ priority: jobs.priority }).from(jobs).get()).toEqual({
      priority: 10,
    });
    expect(inventoryModel(worker.workerId, "small")?.task).toMatchObject({
      action: "download",
      started: false,
      progress: 0,
    });
  });

  it("are leased only by the worker that keeps the cache", async () => {
    const target = connectWorker();
    const other = connectWorker();
    download(target.workerId);

    expect(await leaseJob(other)).toBeNull();
    const lease = await leaseJob(target);

    expect(lease?.payload).toMatchObject({
      kind: "model_cache",
      action: "download",
      workerId: target.workerId,
      modelId: "small",
    });
    expect(inventoryModel(target.workerId, "small")?.task?.started).toBe(true);
  });

  it("complete without touching any project", async () => {
    const worker = connectWorker();
    download(worker.workerId);
    const lease = await leaseJob(worker);
    if (!lease) throw new Error("Expected a lease");

    const outcome = await completeJob(lease.jobId, lease.leaseToken, {
      kind: "model_cache",
      action: "download",
    });

    expect(outcome).toBe("completed");
    expect(inventoryModel(worker.workerId, "small")?.task).toBeNull();
  });

  it("reject a completion for a different action", async () => {
    const worker = connectWorker();
    download(worker.workerId);
    const lease = await leaseJob(worker);
    if (!lease) throw new Error("Expected a lease");

    await expect(
      completeJob(lease.jobId, lease.leaseToken, {
        kind: "model_cache",
        action: "delete",
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(inventoryModel(worker.workerId, "small")?.task?.started).toBe(true);
  });

  it("show the last failure until the next attempt", async () => {
    const worker = connectWorker();
    requestModelTask({
      workerId: worker.workerId,
      adapterId: "whisperx",
      modelId: "tiny",
      action: "delete",
    });
    const lease = await leaseJob(worker);
    if (!lease) throw new Error("Expected a lease");

    await failJob(lease.jobId, lease.leaseToken, {
      code: "model_cache_error",
      message: "Permission denied",
      retryable: false,
    });

    expect(inventoryModel(worker.workerId, "tiny")).toMatchObject({
      task: null,
      failure: "Permission denied",
    });
  });

  it("refuse duplicates, finished work and models that do not fit", () => {
    const worker = connectWorker({}, [
      model("small"),
      model("tiny", { downloaded: true }),
      model("large", { downloadSizeBytes: 80 * GIB }),
    ]);
    download(worker.workerId);

    expect(() => download(worker.workerId)).toThrow(/already being updated/);
    expect(() => download(worker.workerId, "tiny")).toThrow(
      /already downloaded/,
    );
    expect(() => download(worker.workerId, "large")).toThrow(/is free/);
    expect(() =>
      requestModelTask({
        workerId: worker.workerId,
        adapterId: "whisperx",
        modelId: "small",
        action: "delete",
      }),
    ).toThrow(/already being updated/);
  });

  it("need a worker that can manage its models", () => {
    const worker = connectWorker({
      capabilities: { mediaPreparation: null, modelCache: null },
    });

    expect(() => download(worker.workerId)).toThrow(/cannot download/);
    expect(() => download(randomUUID())).toThrow(/no longer connected/);
  });

  it("can be cancelled while they wait or run", async () => {
    const worker = connectWorker();
    download(worker.workerId);
    const job = db.select({ id: jobs.id }).from(jobs).get();
    if (!job) throw new Error("Expected a job");

    expect(cancelModelTask(job.id)).toBe(true);
    expect(cancelModelTask(job.id)).toBe(false);
    expect(
      db
        .select({ state: jobs.state })
        .from(jobs)
        .where(eq(jobs.id, job.id))
        .get(),
    ).toEqual({ state: "cancelled" });
    expect(await leaseJob(worker)).toBeNull();
  });

  it("end the worker's lease when cancelled while running", async () => {
    const worker = connectWorker();
    download(worker.workerId);
    const lease = await leaseJob(worker);
    if (!lease) throw new Error("Expected a lease");

    expect(cancelModelTask(lease.jobId)).toBe(true);

    expect(
      db
        .select({
          state: jobs.state,
          leasedBy: jobs.leasedBy,
          leaseTokenHash: jobs.leaseTokenHash,
        })
        .from(jobs)
        .where(eq(jobs.id, lease.jobId))
        .get(),
    ).toEqual({ state: "cancelled", leasedBy: null, leaseTokenHash: null });
    expect(reportProgress(lease.jobId, lease.leaseToken, 0.5, "Halfway")).toBe(
      false,
    );
  });
});
