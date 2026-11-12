import { and, eq, inArray } from "drizzle-orm";

import { jobs, transcriptionRuns } from "#lib/server/db/schema.ts";
import { withTransaction } from "#lib/server/db/transaction.ts";
import { cancelActiveJobs } from "#lib/server/jobs/release.ts";
import { projectForUser } from "#lib/server/projects/access.ts";
import { ACTIVE_RUN_STATUSES } from "#lib/shared/project-status.ts";

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
          inArray(transcriptionRuns.status, ACTIVE_RUN_STATUSES),
        ),
      )
      .returning({ id: transcriptionRuns.id })
      .all();
    if (active.length === 0) return false;
    cancelActiveJobs(
      tx,
      inArray(
        jobs.runId,
        active.map((run) => run.id),
      ),
    );
    return true;
  });
}
