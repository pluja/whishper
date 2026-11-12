import { randomUUID } from "node:crypto";

import type { WorkerManifest } from "@anysub/contracts";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "#lib/server/db/index.ts";
import { jobs, workers } from "#lib/server/db/schema.ts";
import {
  seedLeasedTranscriptionJob,
  seedProject,
} from "#lib/server/db/testing/fixtures.ts";
import { recordWorkerPresence } from "#lib/server/workers/presence.ts";
import { forgetWorker, listWorkers } from "#lib/server/workers/status.ts";

const GIB = 1024 ** 3;

function connect(name: string): WorkerManifest {
  const manifest: WorkerManifest = {
    protocolVersion: "1.0",
    workerId: randomUUID(),
    name,
    version: "1.2.0",
    architecture: "x86_64",
    capabilities: {
      mediaPreparation: "1.0",
      modelCache: "1.0",
      remoteTranscription: null,
    },
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
  it("removes an offline worker and cancels its waiting and running model jobs", () => {
    const gone = connect("old-laptop");
    lastSeen(gone.workerId, 10);
    const payload = {
      kind: "model_cache",
      action: "download",
      workerId: gone.workerId,
      adapterId: "whisperx",
      modelId: "small",
    } as const;
    db.insert(jobs)
      .values([
        { kind: "model_cache", payload },
        {
          kind: "model_cache",
          payload: { ...payload, modelId: "tiny" },
          state: "leased",
          leasedBy: gone.workerId,
          leaseTokenHash: "hash",
          leaseExpiresAt: new Date(Date.now() + 60_000),
        },
      ])
      .run();

    forgetWorker(gone.workerId);

    expect(listWorkers(db)).toEqual([]);
    expect(
      db
        .select({
          state: jobs.state,
          leaseTokenHash: jobs.leaseTokenHash,
          leaseExpiresAt: jobs.leaseExpiresAt,
        })
        .from(jobs)
        .all(),
    ).toEqual([
      { state: "cancelled", leaseTokenHash: null, leaseExpiresAt: null },
      { state: "cancelled", leaseTokenHash: null, leaseExpiresAt: null },
    ]);
  });

  it("keeps a connected worker", () => {
    const online = connect("gpu-box");

    expect(() => forgetWorker(online.workerId)).toThrow(/still connected/);
    expect(listWorkers(db)).toHaveLength(1);
  });
});
