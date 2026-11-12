import { and, eq } from "drizzle-orm";

import { subtitleTracks, transcriptionRuns } from "#lib/server/db/schema.ts";
import { withTransaction } from "#lib/server/db/transaction.ts";
import { manageableProjectForUser } from "#lib/server/projects/access.ts";

export function deleteTranscriptForUser(
  projectId: string,
  trackId: string,
  userId: string,
): boolean {
  return withTransaction((tx) => {
    if (!manageableProjectForUser(tx, projectId, userId)) return false;
    const track = tx
      .delete(subtitleTracks)
      .where(
        and(
          eq(subtitleTracks.id, trackId),
          eq(subtitleTracks.projectId, projectId),
        ),
      )
      .returning({ sourceRunId: subtitleTracks.sourceRunId })
      .get();
    if (!track) return false;
    if (track.sourceRunId) {
      tx.delete(transcriptionRuns)
        .where(eq(transcriptionRuns.id, track.sourceRunId))
        .run();
    }
    return true;
  });
}
