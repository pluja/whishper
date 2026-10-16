import type { PoolClient } from "pg";

type Queryable = Pick<PoolClient, "query">;

// Workers poll every few seconds, so one silent for this long is gone.
const LIVENESS_WINDOW = "15 seconds";

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
