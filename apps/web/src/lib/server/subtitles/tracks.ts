import { and, desc, eq, sql } from "drizzle-orm";

import type { Executor } from "#lib/server/db/index.ts";
import { subtitleTracks } from "#lib/server/db/schema.ts";
import type { SubtitleTrack } from "#lib/shared/subtitles.ts";

const TRACK_COLUMNS = {
  id: subtitleTracks.id,
  name: subtitleTracks.name,
  language: subtitleTracks.language,
  metadata: subtitleTracks.metadata,
  revision: subtitleTracks.revision,
};

export function trackForProject(
  executor: Executor,
  projectId: string,
  trackId: string,
): SubtitleTrack | null {
  const track = executor
    .select(TRACK_COLUMNS)
    .from(subtitleTracks)
    .where(
      and(
        eq(subtitleTracks.projectId, projectId),
        eq(subtitleTracks.id, trackId),
      ),
    )
    .get();
  return track ?? null;
}

// Two tracks can share a millisecond, so insertion order breaks the tie.
export function latestTrackForProject(
  executor: Executor,
  projectId: string,
): SubtitleTrack | null {
  const track = executor
    .select(TRACK_COLUMNS)
    .from(subtitleTracks)
    .where(eq(subtitleTracks.projectId, projectId))
    .orderBy(desc(subtitleTracks.createdAt), desc(sql`rowid`))
    .limit(1)
    .get();
  return track ?? null;
}
