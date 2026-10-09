import { auth } from "$lib/server/auth";
import { projectForUser, requireUserOrLogin } from "$lib/server/access";
import { pool } from "$lib/server/db";
import { isInstanceInitialized } from "$lib/server/instance";
import {
  normalizeProjectTitle,
  parseProjectLibrarySearch,
} from "$lib/server/project-library";
import { isUuid } from "$lib/uuid";
import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

type ProjectRow = {
  id: string;
  name: string;
  created_at: Date;
  activity_at: Date;
  run_status: string | null;
  job_state: string | null;
  progress: number | null;
  progress_message: string | null;
  upload_status: string | null;
  original_filename: string | null;
  size_bytes: number | null;
  received_bytes: number | null;
  media_duration_us: number | null;
  media_preparation_status: string;
  media_type: string | null;
  has_thumbnail: boolean;
  track_count: number;
  cue_count: number;
  languages: string[];
  subtitle_match: boolean;
  video_width: string | null;
  video_height: string | null;
};

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!(await isInstanceInitialized())) redirect(303, "/setup");
  const user = requireUserOrLogin(locals);
  const search = parseProjectLibrarySearch(url.searchParams);

  const workspace = await pool.query<{
    id: string;
    name: string;
    project_count: number;
    ready_source_count: number;
  }>(
    `select w.id,
            w.name,
            count(distinct p.id)::integer as project_count,
            count(distinct p.id)
              filter (where upload.status = 'completed')::integer
              as ready_source_count
       from workspaces w
       join memberships m on m.workspace_id = w.id
       left join projects p on p.workspace_id = w.id
       left join media_uploads upload on upload.project_id = p.id
      where m.user_id = $1
      group by w.id
      order by w.created_at asc
      limit 1`,
    [user.id],
  );
  const currentWorkspace = workspace.rows[0];
  if (!currentWorkspace) {
    return { workspace: null, projects: [] as ProjectRow[], search };
  }

  const projects = await pool.query<ProjectRow>(
    `select p.id, p.name, p.created_at,
            greatest(
              p.updated_at,
              coalesce(subtitle_summary.updated_at, p.updated_at)
            ) as activity_at,
            p.media_duration_us::double precision as media_duration_us,
            p.media_preparation_status,
            latest_run.status as run_status,
            latest_job.state as job_state,
            latest_job.progress,
            latest_job.progress_message,
            upload.status as upload_status,
            upload.original_filename,
            upload.media_type,
            upload.size_bytes::double precision as size_bytes,
            upload.received_bytes::double precision as received_bytes,
            exists (
              select 1
                from media_derivatives derivative
               where derivative.project_id = p.id
                 and derivative.kind = 'thumbnail'
                 and derivative.status = 'ready'
            ) as has_thumbnail,
            coalesce(subtitle_summary.track_count, 0) as track_count,
            coalesce(subtitle_summary.cue_count, 0) as cue_count,
            coalesce(subtitle_summary.languages, array[]::text[]) as languages,
            coalesce(subtitle_summary.subtitle_match, false) as subtitle_match,
            video_stream.video_width,
            video_stream.video_height
       from projects p
       left join media_uploads upload on upload.project_id = p.id
       left join lateral (
         select count(distinct track.id)::integer as track_count,
                count(cue.id)::integer as cue_count,
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
      order by activity_at desc, p.created_at desc`,
    [currentWorkspace.id, search.query, search.includeSubtitles],
  );

  return { workspace: currentWorkspace, projects: projects.rows, search };
};

export const actions: Actions = {
  renameProject: async ({ locals, request, url }) => {
    const user = requireUserOrLogin(locals);
    const values = await request.formData();
    const projectId = String(values.get("projectId") ?? "");
    const name = normalizeProjectTitle(values.get("name"));
    if (!isUuid(projectId)) {
      return fail(400, {
        renameProjectId: projectId,
        renameError: "That project could not be found.",
      });
    }
    if (!name) {
      return fail(400, {
        renameProjectId: projectId,
        renameError: "Enter a project title.",
      });
    }

    try {
      const project = await projectForUser(projectId, user.id);
      if (!project) {
        return fail(404, {
          renameProjectId: projectId,
          renameError: "That project could not be found.",
        });
      }
      await pool.query(
        "update projects set name = $1, updated_at = now() where id = $2",
        [name, project.id],
      );
    } catch (cause) {
      console.error("Could not rename project", cause);
      return fail(500, {
        renameProjectId: projectId,
        renameError: "The title could not be saved. Try again.",
      });
    }

    url.searchParams.delete("/renameProject");
    redirect(303, `${url.pathname}${url.search}`);
  },
  signOut: async ({ request }) => {
    await auth.api.signOut({ headers: request.headers });
    redirect(303, "/login");
  },
};
