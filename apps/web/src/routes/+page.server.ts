import { auth } from "$lib/server/auth";
import { pool } from "$lib/server/db";
import { isInstanceInitialized } from "$lib/server/instance";
import {
  normalizeProjectTitle,
  parseProjectLibrarySearch,
} from "$lib/server/project-library";
import { fail, redirect, type Actions } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

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
  if (!locals.user) redirect(303, "/login");
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
    [locals.user.id],
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
  createDemo: async ({ locals }) => {
    if (!locals.user) redirect(303, "/login");
    const client = await pool.connect();
    try {
      await client.query("begin");
      const membership = await client.query<{ workspace_id: string }>(
        `select workspace_id from memberships where user_id = $1 order by created_at asc limit 1`,
        [locals.user.id],
      );
      const workspaceId = membership.rows[0]?.workspace_id;
      if (!workspaceId)
        return fail(409, { message: "Your account has no workspace." });

      const project = await client.query<{ id: string }>(
        `insert into projects (workspace_id, name, created_by)
         values ($1, 'Adapter contract demo', $2)
         returning id`,
        [workspaceId, locals.user.id],
      );
      const run = await client.query<{ id: string }>(
        `insert into transcription_runs
          (project_id, adapter_id, model_id, options, created_by)
         values ($1, 'builtin.fake', 'fake-v1', '{"delayMs": 80}'::jsonb, $2)
         returning id`,
        [project.rows[0].id, locals.user.id],
      );
      await client.query(
        `insert into jobs (workspace_id, run_id, kind, payload)
         values ($1, $2, 'transcribe', $3)`,
        [
          workspaceId,
          run.rows[0].id,
          JSON.stringify({
            kind: "transcribe",
            adapterId: "builtin.fake",
            modelId: "fake-v1",
            projectId: project.rows[0].id,
            runId: run.rows[0].id,
            language: "en",
            options: { delayMs: 80 },
          }),
        ],
      );
      await client.query("commit");
      redirect(303, `/projects/${project.rows[0].id}`);
    } catch (cause) {
      await client.query("rollback");
      if (cause && typeof cause === "object" && "status" in cause) throw cause;
      console.error("Could not create demo project", cause);
      return fail(500, {
        message: "The demo project could not be created. Try again.",
      });
    } finally {
      client.release();
    }
  },
  renameProject: async ({ locals, request, url }) => {
    if (!locals.user) redirect(303, "/login");
    const values = await request.formData();
    const projectId = String(values.get("projectId") ?? "");
    const name = normalizeProjectTitle(values.get("name"));
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        projectId,
      )
    ) {
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
      const renamed = await pool.query<{ id: string }>(
        `update projects p
            set name = $1,
                updated_at = now()
          where p.id = $2
            and exists (
              select 1
                from memberships membership
               where membership.workspace_id = p.workspace_id
                 and membership.user_id = $3
            )
          returning p.id`,
        [name, projectId, locals.user.id],
      );
      if (renamed.rowCount !== 1) {
        return fail(404, {
          renameProjectId: projectId,
          renameError: "That project could not be found.",
        });
      }
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
