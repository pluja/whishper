import type { WorkerManifest } from "@anysub/contracts";
import { asc, eq } from "drizzle-orm";

import type { Executor } from "$lib/server/db";
import { jobs, projects, workers } from "$lib/server/db/schema";
import { withTransaction } from "$lib/server/db/transaction";
import { conflict } from "$lib/server/http/errors";
import { isModelCacheJobOf } from "$lib/server/jobs/predicates";
import { cancelActiveJobs } from "$lib/server/jobs/release";
import { LIVENESS_WINDOW_MS } from "$lib/server/workers/presence";
import type {
  WorkerJobSummary,
  WorkerOverview,
} from "$lib/shared/worker-status";

type LeasedJob = {
  leasedBy: string | null;
  payload: typeof jobs.$inferSelect.payload;
  progress: number;
  progressMessage: string | null;
  projectId: string | null;
  projectName: string | null;
};

export function listWorkers(executor: Executor): WorkerOverview[] {
  const now = Date.now();
  const leased = executor
    .select({
      leasedBy: jobs.leasedBy,
      payload: jobs.payload,
      progress: jobs.progress,
      progressMessage: jobs.progressMessage,
      projectId: jobs.projectId,
      projectName: projects.name,
    })
    .from(jobs)
    .leftJoin(projects, eq(projects.id, jobs.projectId))
    .where(eq(jobs.state, "leased"))
    .all();
  return executor
    .select()
    .from(workers)
    .orderBy(asc(workers.name))
    .all()
    .map((worker): WorkerOverview => {
      const online = now - worker.lastSeenAt.getTime() < LIVENESS_WINDOW_MS;
      const job = online
        ? leased.find((candidate) => candidate.leasedBy === worker.id)
        : undefined;
      return {
        id: worker.id,
        name: worker.name,
        version: worker.version,
        architecture: worker.architecture,
        state: !online ? "offline" : job ? "busy" : "idle",
        lastSeenAt: worker.lastSeenAt,
        ...describeManifest(worker.manifest),
        currentJob: job ? summarizeJob(job, worker.manifest) : null,
      };
    })
    .sort(
      (left, right) =>
        Number(left.state === "offline") - Number(right.state === "offline"),
    );
}

export function forgetWorker(workerId: string): void {
  withTransaction((tx) => {
    const worker = tx
      .select({ lastSeenAt: workers.lastSeenAt })
      .from(workers)
      .where(eq(workers.id, workerId))
      .get();
    if (!worker) return;
    if (Date.now() - worker.lastSeenAt.getTime() < LIVENESS_WINDOW_MS) {
      throw conflict(
        "That worker is still connected. Stop its container before removing it.",
      );
    }
    cancelActiveJobs(tx, isModelCacheJobOf(workerId), "Worker removed");
    tx.delete(workers).where(eq(workers.id, workerId)).run();
  });
}

function describeManifest(
  manifest: WorkerManifest,
): Omit<
  WorkerOverview,
  | "id"
  | "name"
  | "version"
  | "architecture"
  | "state"
  | "lastSeenAt"
  | "currentJob"
> {
  const models = manifest.adapters.flatMap((adapter) => adapter.models);
  const hardware = manifest.hardware ?? null;
  return {
    device: hardware?.device ?? null,
    cpu: hardware
      ? { model: hardware.cpu.model ?? null, cores: hardware.cpu.logicalCores }
      : null,
    memory: hardware?.memory ?? null,
    gpus: (hardware?.gpus ?? []).map((gpu) => ({
      name: gpu.name,
      totalMemoryBytes: gpu.totalMemoryBytes,
    })),
    storage: manifest.modelStorage ?? null,
    downloadedModels: models.filter((model) => model.downloaded === true)
      .length,
    offeredModels: models.length,
  };
}

function summarizeJob(
  job: LeasedJob,
  manifest: WorkerManifest,
): WorkerJobSummary {
  const { payload } = job;
  const common = {
    progress: job.progress,
    message: job.progressMessage,
    projectId: job.projectId,
  };
  if (payload.kind === "model_cache") {
    const model = manifest.adapters
      .find((adapter) => adapter.id === payload.adapterId)
      ?.models.find((candidate) => candidate.id === payload.modelId);
    const name = model?.displayName ?? payload.modelId;
    return {
      ...common,
      kind: payload.kind,
      title:
        payload.action === "download"
          ? `Downloading ${name}`
          : `Removing ${name}`,
    };
  }
  const project = job.projectName ?? "a deleted project";
  return {
    ...common,
    kind: payload.kind,
    title:
      payload.kind === "transcribe"
        ? `Transcribing ${project}`
        : `Preparing ${project}`,
  };
}
