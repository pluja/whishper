import { pool } from "$lib/server/db";
import { error, redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

interface CueRow {
  id: string;
  position: number;
  start_us: number;
  end_us: number;
  text: string;
  words: Record<string, unknown>[];
}

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.user) redirect(303, "/login");

  const project = await pool.query<{
    id: string;
    name: string;
    created_at: Date;
    workspace_name: string;
    media_filename: string | null;
    media_original_key: string | null;
    upload_status: string | null;
    size_bytes: number | null;
  }>(
    `select p.id, p.name, p.created_at, w.name as workspace_name,
            p.media_filename, p.media_original_key,
            upload.status as upload_status, upload.size_bytes
       from projects p
       join workspaces w on w.id = p.workspace_id
       join memberships m on m.workspace_id = p.workspace_id
       left join media_uploads upload on upload.project_id = p.id
      where p.id = $1 and m.user_id = $2`,
    [params.projectId, locals.user.id],
  );
  if (!project.rows[0]) error(404, "Project not found");

  const run = await pool.query<{
    id: string;
    status: string;
    adapter_id: string;
    model_id: string;
    created_at: Date;
    job_state: string | null;
    progress: number | null;
    progress_message: string | null;
    error: Record<string, unknown> | null;
  }>(
    `select r.id, r.status, r.adapter_id, r.model_id, r.created_at,
            j.state as job_state, j.progress, j.progress_message, j.error
       from transcription_runs r
       left join lateral (
         select state, progress, progress_message, error
           from jobs
          where run_id = r.id
          order by created_at desc
          limit 1
       ) j on true
      where r.project_id = $1
      order by r.created_at desc
      limit 1`,
    [params.projectId],
  );

  const track = await pool.query<{
    id: string;
    name: string;
    language: string;
    metadata: Record<string, unknown>;
  }>(
    `select id, name, language, metadata
       from subtitle_tracks
      where project_id = $1
      order by created_at desc
      limit 1`,
    [params.projectId],
  );

  let cues: CueRow[] = [];
  if (track.rows[0]) {
    cues = (
      await pool.query<CueRow>(
        `select id, position, start_us, end_us, text, words
           from cues where track_id = $1 order by position asc`,
        [track.rows[0].id],
      )
    ).rows;
  }

  return {
    project: project.rows[0],
    run: run.rows[0] ?? null,
    track: track.rows[0] ?? null,
    cues,
  };
};
