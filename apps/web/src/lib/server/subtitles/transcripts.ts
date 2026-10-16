import { withTransaction } from "$lib/server/db/transaction";
import { manageableProjectForUser } from "$lib/server/projects/access";

export async function deleteTranscriptForUser(
  projectId: string,
  trackId: string,
  userId: string,
): Promise<boolean> {
  return withTransaction(async (client) => {
    if (!(await manageableProjectForUser(client, projectId, userId))) {
      return false;
    }
    const track = await client.query<{ source_run_id: string | null }>(
      `delete from subtitle_tracks
        where id = $1 and project_id = $2
        returning source_run_id`,
      [trackId, projectId],
    );
    if (!track.rows[0]) return false;
    if (track.rows[0].source_run_id) {
      await client.query("delete from transcription_runs where id = $1", [
        track.rows[0].source_run_id,
      ]);
    }
    return true;
  });
}
