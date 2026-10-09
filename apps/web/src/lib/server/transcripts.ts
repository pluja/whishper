import { withTransaction } from "$lib/server/db/transaction";

export async function deleteTranscriptForUser(
  projectId: string,
  trackId: string,
  userId: string,
): Promise<boolean> {
  return withTransaction(async (client) => {
    const track = await client.query<{ source_run_id: string | null }>(
      `select track.source_run_id
         from subtitle_tracks track
         join projects p on p.id = track.project_id
         join memberships m on m.workspace_id = p.workspace_id
        where track.id = $1 and p.id = $2 and m.user_id = $3
          and (p.created_by = $3 or m.role in ('owner', 'admin'))
        for update of track`,
      [trackId, projectId, userId],
    );
    if (!track.rows[0]) return false;

    await client.query("delete from subtitle_tracks where id = $1", [trackId]);
    if (track.rows[0].source_run_id) {
      await client.query("delete from transcription_runs where id = $1", [
        track.rows[0].source_run_id,
      ]);
    }
    return true;
  });
}
