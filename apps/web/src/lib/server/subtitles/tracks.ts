import type { PoolClient } from "pg";

type Queryable = Pick<PoolClient, "query">;

export type SubtitleTrack = {
  id: string;
  name: string;
  language: string;
  metadata: Record<string, unknown>;
  revision: number;
};

const TRACK_COLUMNS = "id, name, language, metadata, revision";

export async function trackForProject(
  executor: Queryable,
  projectId: string,
  trackId: string,
): Promise<SubtitleTrack | null> {
  const result = await executor.query<SubtitleTrack>(
    `select ${TRACK_COLUMNS}
       from subtitle_tracks
      where project_id = $1 and id = $2`,
    [projectId, trackId],
  );
  return result.rows[0] ?? null;
}

export async function latestTrackForProject(
  executor: Queryable,
  projectId: string,
): Promise<SubtitleTrack | null> {
  const result = await executor.query<SubtitleTrack>(
    `select ${TRACK_COLUMNS}
       from subtitle_tracks
      where project_id = $1
      order by created_at desc
      limit 1`,
    [projectId],
  );
  return result.rows[0] ?? null;
}
