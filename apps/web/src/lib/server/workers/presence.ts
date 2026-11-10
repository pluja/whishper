import type { WorkerManifest } from "@anysub/contracts";
import { gt } from "drizzle-orm";

import type { Executor } from "$lib/server/db";
import { workers } from "$lib/server/db/schema";

// Must exceed the worker's heartbeat interval plus its request timeout, or a
// worker busy with a job drops out of the model picker between heartbeats.
export const LIVENESS_WINDOW_MS = 45_000;

export function recordWorkerPresence(
  executor: Executor,
  manifest: WorkerManifest,
): void {
  const announced = {
    name: manifest.name,
    version: manifest.version,
    architecture: manifest.architecture,
    protocolVersion: manifest.protocolVersion,
    manifest,
    lastSeenAt: new Date(),
  };
  executor
    .insert(workers)
    .values({ id: manifest.workerId, ...announced })
    .onConflictDoUpdate({ target: workers.id, set: announced })
    .run();
}

export function activeWorkerManifests(executor: Executor): WorkerManifest[] {
  return executor
    .select({ manifest: workers.manifest })
    .from(workers)
    .where(gt(workers.lastSeenAt, new Date(Date.now() - LIVENESS_WINDOW_MS)))
    .all()
    .map((worker) => worker.manifest);
}
