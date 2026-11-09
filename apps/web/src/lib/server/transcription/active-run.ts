import { and, eq, inArray } from "drizzle-orm";

import type { Executor } from "$lib/server/db";
import { transcriptionRuns } from "$lib/server/db/schema";

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
          inArray(transcriptionRuns.status, ["queued", "running"]),
        ),
      )
      .limit(1)
      .get() !== undefined
  );
}
