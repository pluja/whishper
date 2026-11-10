import { randomUUID } from "node:crypto";

import type { WorkerManifest } from "@anysub/contracts";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "$lib/server/db";
import { jobs, workers } from "$lib/server/db/schema";
import {
  seedLeasedTranscriptionJob,
  seedProject,
} from "$lib/server/db/testing/fixtures";
import { recordWorkerPresence } from "$lib/server/workers/presence";
import { forgetWorker, listWorkers } from "$lib/server/workers/status";

const GIB = 1024 ** 3;

function connect(name: string): WorkerManifest {
  const manifest: WorkerManifest = {
    protocolVersion: "1.0",
    workerId: randomUUID(),
    name,
    version: "1.2.0",
    architecture: "x86_64",
    capabilities: { mediaPreparation: "1.0", modelCache: "1.0" },
    adapters: [],
    hardware: {
      device: "cuda",
      cpu: { model: "Test CPU", logicalCores: 16 },
      memory: { totalBytes: 32 * GIB, availableBytes: 20 * GIB },
      gpus: [{ name: "Test GPU", backend: "cuda", totalMemoryBytes: 12 * GIB }],
    },
    modelStorage: { totalBytes: 500 * GIB, availableBytes: 200 * GIB },
  };
  recordWorkerPresence(db, manifest);
  return manifest;
}

function lastSeen(workerId: string, minutesAgo: number): void {
  db.update(workers)
    .set({ lastSeenAt: new Date(Date.now() - minutesAgo * 60_000) })
    .where(eq(workers.id, workerId))
    .run();
}

describe("listWorkers", () => {
  it("reports each worker's state, hardware and current job", () => {
    const busy = connect("gpu-box");
    const idle = connect("spare");
    const gone = connect("old-laptop");
    lastSeen(gone.workerId, 10);
    const project = seedProject();
    const job = seedLeasedTranscriptionJob(project, {
      attempts: 1,
      maxAttempts: 3,
      expiresInSeconds: 60,
    });
    db.update(jobs)
      .set({ leasedBy: busy.workerId, progress: 0.4 })
      .where(eq(jobs.id, job.jobId))
      .run();

    const listed = listWorkers(db);

    expect(listed.map((worker) => [worker.name, worker.state])).toEqual([
      ["gpu-box", "busy"],
      ["spare", "idle"],
      ["old-laptop", "offline"],
    ]);
    expect(listed[0]).toMatchObject({
      device: "cuda",
      cpu: { model: "Test CPU", cores: 16 },
      gpus: [{ name: "Test GPU", totalMemoryBytes: 12 * GIB }],
      storage: { availableBytes: 200 * GIB },
      currentJob: {
        kind: "transcribe",
        title: "Transcribing Project",
        progress: 0.4,
        projectId: project.projectId,
      },
    });
    expect(listed[1]?.id).toBe(idle.workerId);
  });
});

describe("forgetWorker", () => {
  it("removes an offline worker and its waiting model jobs", () => {
    const gone = connect("old-laptop");
    lastSeen(gone.workerId, 10);
    db.insert(jobs)
      .values({
        kind: "model_cache",
        payload: {
          kind: "model_cache",
          action: "download",
          workerId: gone.workerId,
          adapterId: "whisperx",
          modelId: "small",
        },
      })
      .run();

    forgetWorker(gone.workerId);

    expect(listWorkers(db)).toEqual([]);
    expect(db.select({ state: jobs.state }).from(jobs).get()).toEqual({
      state: "cancelled",
    });
  });

  it("keeps a connected worker", () => {
    const online = connect("gpu-box");

    expect(() => forgetWorker(online.workerId)).toThrow(/still connected/);
    expect(listWorkers(db)).toHaveLength(1);
  });
});
