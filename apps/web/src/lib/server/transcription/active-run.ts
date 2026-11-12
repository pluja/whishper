import { and, eq, inArray } from "drizzle-orm";

import type { Executor } from "#lib/server/db/index.ts";
import { transcriptionRuns } from "#lib/server/db/schema.ts";
import { ACTIVE_RUN_STATUSES } from "#lib/shared/project-status.ts";

export function hasActiveTranscriptionRun(
  executor: Executor,
  projectId: string,
): boolean {
  return (
    executor
      .select({ id: transcriptionRuns.id })
      .from(transcriptionRuns)
      .where(
        and(
          eq(transcriptionRuns.projectId, projectId),
          inArray(transcriptionRuns.status, ACTIVE_RUN_STATUSES),
        ),
      )
      .limit(1)
      .get() !== undefined
  );
}
