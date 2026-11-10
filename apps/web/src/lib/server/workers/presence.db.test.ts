import { randomUUID } from "node:crypto";

import type { WorkerManifest } from "@anysub/contracts";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "$lib/server/db";
import { workers } from "$lib/server/db/schema";
import {
  activeWorkerManifests,
  recordWorkerPresence,
} from "$lib/server/workers/presence";

function manifest(): WorkerManifest {
  return {
    protocolVersion: "1.0",
    workerId: randomUUID(),
    name: "presence-test",
    version: "1.0.0",
    architecture: "x86_64",
    capabilities: { mediaPreparation: null, modelCache: null },
    adapters: [],
    hardware: null,
    modelStorage: null,
  };
}

function activeIds(): string[] {
  return activeWorkerManifests(db).map((active) => active.workerId);
}

function lastSeenSecondsAgo(workerId: string, seconds: number): void {
  db.update(workers)
    .set({ lastSeenAt: new Date(Date.now() - seconds * 1000) })
    .where(eq(workers.id, workerId))
    .run();
}

describe("worker presence", () => {
  it("lists a worker that just announced itself", () => {
    const worker = manifest();
    recordWorkerPresence(db, worker);
    expect(activeIds()).toContain(worker.workerId);
  });

  it("keeps a busy worker listed between heartbeats", () => {
    const worker = manifest();
    recordWorkerPresence(db, worker);
    lastSeenSecondsAgo(worker.workerId, 30);
    expect(activeIds()).toContain(worker.workerId);
  });

  it("drops a worker that has gone silent", () => {
    const worker = manifest();
    recordWorkerPresence(db, worker);
    lastSeenSecondsAgo(worker.workerId, 60);
    expect(activeIds()).not.toContain(worker.workerId);
  });

  it("replaces the stored manifest when a worker announces again", () => {
    const worker = manifest();
    recordWorkerPresence(db, worker);
    recordWorkerPresence(db, { ...worker, name: "renamed" });
    const stored = db
      .select({ name: workers.name })
      .from(workers)
      .where(eq(workers.id, worker.workerId))
      .get();
    expect(stored?.name).toBe("renamed");
  });
});
