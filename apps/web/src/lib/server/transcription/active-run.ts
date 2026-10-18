import type { Queryable } from "$lib/server/db/types";

export async function hasActiveTranscriptionRun(
  executor: Queryable,
  projectId: string,
): Promise<boolean> {
  const result = await executor.query(
    `select 1 from transcription_runs
      where project_id = $1 and status in ('queued', 'running')
      limit 1`,
    [projectId],
  );
  return Boolean(result.rowCount);
}
