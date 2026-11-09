import { withTransaction } from "$lib/server/db/transaction";
import { projectForUser } from "$lib/server/projects/access";

export async function cancelTranscriptionForUser(
  projectId: string,
  userId: string,
): Promise<boolean> {
  return withTransaction(async (client) => {
    if (!(await projectForUser(client, projectId, userId))) return false;
    const active = await client.query<{ id: string }>(
      `select id from transcription_runs
        where project_id = $1 and status in ('queued', 'running')`,
      [projectId],
    );
    if (active.rowCount === 0) return false;
    const runIds = active.rows.map((run) => run.id);
    // Jobs before runs, the order leasing locks them in.
    await client.query(
      `select id from jobs where run_id = any($1::uuid[]) for update`,
      [runIds],
    );
    await client.query(
      `update transcription_runs set status = 'cancelled'
        where id = any($1::uuid[]) and status in ('queued', 'running')`,
      [runIds],
    );
    await client.query(
      `update jobs
          set state = 'cancelled', lease_token_hash = null,
              lease_expires_at = null, progress_message = 'Cancelled',
              updated_at = now()
        where run_id = any($1::uuid[]) and state in ('queued', 'leased')`,
      [runIds],
    );
    return true;
  });
}
