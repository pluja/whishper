import { and, eq, inArray } from "drizzle-orm";

import { jobs, transcriptionRuns } from "$lib/server/db/schema";
import { withTransaction } from "$lib/server/db/transaction";
import { isActiveJob } from "$lib/server/jobs/predicates";
import { projectForUser } from "$lib/server/projects/access";

export function cancelTranscriptionForUser(
  projectId: string,
  userId: string,
): boolean {
  return withTransaction((tx) => {
    if (!projectForUser(tx, projectId, userId)) return false;
    const active = tx
      .update(transcriptionRuns)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(transcriptionRuns.projectId, projectId),
          inArray(transcriptionRuns.status, ["queued", "running"]),
        ),
      )
      .returning({ id: transcriptionRuns.id })
      .all();
    if (active.length === 0) return false;
    tx.update(jobs)
      .set({
        state: "cancelled",
        leaseTokenHash: null,
        leaseExpiresAt: null,
        progressMessage: "Cancelled",
      })
      .where(
        and(
          inArray(
            jobs.runId,
            active.map((run) => run.id),
          ),
          isActiveJob,
        ),
      )
      .run();
    return true;
  });
}
