import { and, eq, inArray, sql } from "drizzle-orm";

import { jobs } from "$lib/server/db/schema";

export const isMediaPrepareJob = eq(jobs.kind, "media_prepare");
export const isActiveJob = inArray(jobs.state, ["queued", "leased"]);

// Each worker keeps its own model cache, so only the worker a model job names
// may lease it.
export function isModelCacheJobFor(workerId: string, adapterIds: string[]) {
  return and(
    eq(jobs.kind, "model_cache"),
    sql`${jobs.payload} ->> 'workerId' = ${workerId}`,
    inArray(sql`${jobs.payload} ->> 'adapterId'`, adapterIds),
  );
}
