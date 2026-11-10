import { and, eq, gt, inArray, sql } from "drizzle-orm";

import { jobs } from "$lib/server/db/schema";
import { hashToken } from "$lib/server/jobs/lease-token";

type PayloadField = "adapterId" | "workerId";

export const isMediaPrepareJob = eq(jobs.kind, "media_prepare");
export const isActiveJob = inArray(jobs.state, ["queued", "leased"]);

export function payloadField(field: PayloadField) {
  return sql<string>`${jobs.payload} ->> ${field}`;
}

export function holdsActiveLease(leaseToken: string, now = new Date()) {
  return and(
    eq(jobs.state, "leased"),
    eq(jobs.leaseTokenHash, hashToken(leaseToken)),
    gt(jobs.leaseExpiresAt, now),
  );
}

// Each worker keeps its own model cache, so a model job belongs to the worker
// it names and only that worker may lease it.
export function isModelCacheJobOf(workerId: string) {
  return and(
    eq(jobs.kind, "model_cache"),
    eq(payloadField("workerId"), workerId),
  );
}
