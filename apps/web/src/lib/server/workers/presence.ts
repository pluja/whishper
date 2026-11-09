import type { WorkerManifest } from "@anysub/contracts";

import type { Queryable } from "$lib/server/db/types";

// Must exceed the worker's heartbeat interval plus its request timeout, or a
// worker busy with a job drops out of the model picker between heartbeats.
const LIVENESS_WINDOW = "45 seconds";

export async function recordWorkerPresence(
  executor: Queryable,
  manifest: WorkerManifest,
): Promise<void> {
  await executor.query(
    `insert into workers (id, name, version, architecture, protocol_version, manifest, last_seen_at)
     values ($1, $2, $3, $4, $5, $6, now())
     on conflict (id) do update set
       name = excluded.name,
       version = excluded.version,
       architecture = excluded.architecture,
       protocol_version = excluded.protocol_version,
       manifest = excluded.manifest,
       last_seen_at = now()`,
    [
      manifest.workerId,
      manifest.name,
      manifest.version,
      manifest.architecture,
      manifest.protocolVersion,
      JSON.stringify(manifest),
    ],
  );
}

export async function activeWorkerManifests(
  executor: Queryable,
): Promise<unknown[]> {
  const result = await executor.query<{ manifest: unknown }>(
    `select manifest
       from workers
      where last_seen_at > now() - $1::interval`,
    [LIVENESS_WINDOW],
  );
  return result.rows.map((worker) => worker.manifest);
}
