import type { Queryable } from "$lib/server/db/types";
import type {
  LibrarySearch,
  ProjectSummary,
  WorkspaceSummary,
} from "$lib/shared/library-data";
import {
  PROJECT_SEARCH_MAX_LENGTH,
  PROJECT_TITLE_MAX_LENGTH,
} from "$lib/shared/limits";

export function parseProjectLibrarySearch(
  searchParams: URLSearchParams,
): LibrarySearch {
  return {
    query: (searchParams.get("q") ?? "")
      .trim()
      .slice(0, PROJECT_SEARCH_MAX_LENGTH),
    includeSubtitles: searchParams.get("scope") === "subtitles",
  };
}

export function normalizeProjectTitle(
  value: FormDataEntryValue | null,
): string {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PROJECT_TITLE_MAX_LENGTH);
}

export async function primaryWorkspaceForUser(
  executor: Queryable,
  userId: string,
): Promise<WorkspaceSummary | null> {
  const result = await executor.query<WorkspaceSummary>(
    `select w.id,
            w.name,
            count(distinct p.id) as "projectCount",
            count(distinct p.id)
              filter (where upload.status = 'completed')
              as "readySourceCount"
       from workspaces w
       join memberships m on m.workspace_id = w.id
       left join projects p on p.workspace_id = w.id
       left join media_uploads upload on upload.project_id = p.id
      where m.user_id = $1
      group by w.id
      order by w.created_at asc
      limit 1`,
    [userId],
  );
  return result.rows[0] ?? null;
}

export async function listLibraryProjects(
  executor: Queryable,
  workspaceId: string,
  search: LibrarySearch,
): Promise<ProjectSummary[]> {
  const result = await executor.query<ProjectSummary>(
    `select p.id, p.name, p.created_at as "createdAt",
            greatest(
              p.updated_at,
              coalesce(subtitle_summary.updated_at, p.updated_at)
            ) as "activityAt",
            p.media_duration_us as "mediaDurationUs",
            p.media_preparation_status as "mediaPreparationStatus",
            latest_run.status as "runStatus",
            latest_job.state as "jobState",
            latest_job.progress,
            latest_job.progress_message as "progressMessage",
            upload.status as "uploadStatus",
            upload.original_filename as "originalFilename",
            upload.media_type as "mediaType",
            upload.size_bytes as "sizeBytes",
            upload.received_bytes as "receivedBytes",
            exists (
              select 1
                from media_derivatives derivative
               where derivative.project_id = p.id
                 and derivative.kind = 'thumbnail'
                 and derivative.status = 'ready'
            ) as "hasThumbnail",
            coalesce(subtitle_summary.track_count, 0) as "trackCount",
            coalesce(subtitle_summary.cue_count, 0) as "cueCount",
            coalesce(subtitle_summary.languages, array[]::text[]) as languages,
            coalesce(subtitle_summary.subtitle_match, false) as "subtitleMatch",
            video_stream.video_width as "videoWidth",
            video_stream.video_height as "videoHeight"
       from projects p
       left join media_uploads upload on upload.project_id = p.id
       left join lateral (
         select count(distinct track.id) as track_count,
                count(cue.id) as cue_count,
                coalesce(
                  array_agg(distinct track.language order by track.language)
                    filter (where track.language <> ''),
                  array[]::text[]
                ) as languages,
                max(track.updated_at) as updated_at,
                coalesce(
                  bool_or(
                    $2 <> ''
                    and strpos(lower(cue.text), lower($2)) > 0
                  ),
                  false
                ) as subtitle_match
           from subtitle_tracks track
           left join cues cue on cue.track_id = track.id
          where track.project_id = p.id
       ) subtitle_summary on true
       left join lateral (
         select stream->'video'->>'width' as video_width,
                stream->'video'->>'height' as video_height
           from jsonb_array_elements(
             coalesce(p.media_probe->'streams', '[]'::jsonb)
           ) stream
          where stream->>'type' = 'video'
            and stream->'video'->>'attachedPicture' is distinct from 'true'
          limit 1
       ) video_stream on true
       left join lateral (
         select r.id, r.status
           from transcription_runs r
          where r.project_id = p.id
          order by r.created_at desc
          limit 1
       ) latest_run on true
       left join lateral (
         select j.state, j.progress, j.progress_message
           from jobs j
          where j.run_id = latest_run.id
          order by j.created_at desc
          limit 1
       ) latest_job on true
      where p.workspace_id = $1
        and (
          $2 = ''
          or strpos(lower(p.name), lower($2)) > 0
          or ($3 and subtitle_summary.subtitle_match)
        )
      order by "activityAt" desc, p.created_at desc`,
    [workspaceId, search.query, search.includeSubtitles],
  );
  return result.rows;
}

export async function renameProjectForUser(
  executor: Queryable,
  projectId: string,
  userId: string,
  name: string,
): Promise<boolean> {
  const result = await executor.query(
    `update projects
        set name = $3, updated_at = now()
      where id = $1
        and exists (
          select 1
            from memberships m
           where m.workspace_id = projects.workspace_id and m.user_id = $2
        )`,
    [projectId, userId, name],
  );
  return result.rowCount === 1;
}
