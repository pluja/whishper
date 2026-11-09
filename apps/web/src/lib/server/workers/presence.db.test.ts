import { randomUUID } from "node:crypto";

import type { WorkerManifest } from "@anysub/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { pool } from "$lib/server/db";
import {
  activeWorkerManifests,
  recordWorkerPresence,
} from "$lib/server/workers/presence";

const recordedWorkerIds: string[] = [];

function manifest(): WorkerManifest {
  const workerId = randomUUID();
  recordedWorkerIds.push(workerId);
  return {
    protocolVersion: "1.0",
    workerId,
    name: "presence-test",
    version: "1.0.0",
    architecture: "x86_64",
    capabilities: { mediaPreparation: null },
    adapters: [],
    hardware: null,
  };
}

async function activeIds(): Promise<string[]> {
  const manifests = (await activeWorkerManifests(pool)) as WorkerManifest[];
  return manifests.map((active) => active.workerId);
}

async function lastSeenSecondsAgo(workerId: string, seconds: number) {
  await pool.query(
    `update workers set last_seen_at = now() - make_interval(secs => $2)
      where id = $1`,
    [workerId, seconds],
  );
}

afterEach(async () => {
  await pool.query(`delete from workers where id = any($1::uuid[])`, [
    recordedWorkerIds.splice(0),
  ]);
});

describe("worker presence", () => {
  it("lists a worker that just announced itself", async () => {
    const worker = manifest();
    await recordWorkerPresence(pool, worker);
    expect(await activeIds()).toContain(worker.workerId);
  });

  it("keeps a busy worker listed between heartbeats", async () => {
    const worker = manifest();
    await recordWorkerPresence(pool, worker);
    await lastSeenSecondsAgo(worker.workerId, 30);
    expect(await activeIds()).toContain(worker.workerId);
  });

  it("drops a worker that has gone silent", async () => {
    const worker = manifest();
    await recordWorkerPresence(pool, worker);
    await lastSeenSecondsAgo(worker.workerId, 60);
    expect(await activeIds()).not.toContain(worker.workerId);
  });

  it("replaces the stored manifest when a worker announces again", async () => {
    const worker = manifest();
    await recordWorkerPresence(pool, worker);
    await recordWorkerPresence(pool, { ...worker, name: "renamed" });
    const stored = await pool.query<{ name: string }>(
      `select name from workers where id = $1`,
      [worker.workerId],
    );
    expect(stored.rows[0].name).toBe("renamed");
  });
});
