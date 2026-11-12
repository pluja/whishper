import { and, type SQL } from "drizzle-orm";

import type { Executor } from "#lib/server/db/index.ts";
import { jobs } from "#lib/server/db/schema.ts";
import { isActiveJob } from "#lib/server/jobs/predicates.ts";

export const RELEASED_LEASE = {
  leasedBy: null,
  leaseTokenHash: null,
  leaseExpiresAt: null,
} as const;

export function cancelActiveJobs(
  executor: Executor,
  scope: SQL | undefined,
  progressMessage = "Cancelled",
): string[] {
  return executor
    .update(jobs)
    .set({ state: "cancelled", progressMessage, ...RELEASED_LEASE })
    .where(and(isActiveJob, scope))
    .returning({ id: jobs.id })
    .all()
    .map((job) => job.id);
}
