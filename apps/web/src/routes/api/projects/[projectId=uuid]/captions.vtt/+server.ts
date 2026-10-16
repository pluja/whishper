import { pool } from "$lib/server/db";
import { projectForUser } from "$lib/server/projects/access";
import { requireUser } from "$lib/server/auth/session";
import { renderWebVtt } from "$lib/shared/subtitles";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, params }) => {
  const user = requireUser(locals);
  const project = await projectForUser(params.projectId, user.id);
  if (!project) error(404, "Captions not found");

  const cues = await pool.query<{
    id: string;
    position: number;
    start_us: number;
    end_us: number;
    text: string;
  }>(
    `select c.id, c.position, c.start_us, c.end_us, c.text
       from cues c
      where c.track_id = (
        select id from subtitle_tracks
         where project_id = $1 order by created_at desc limit 1
      )
      order by c.position asc`,
    [project.id],
  );
  if (!cues.rowCount) error(404, "Captions not found");

  const body = renderWebVtt(
    cues.rows.map((cue) => ({
      id: cue.id,
      position: cue.position,
      startUs: cue.start_us,
      endUs: cue.end_us,
      text: cue.text,
    })),
  );
  return new Response(body, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "text/vtt; charset=utf-8",
    },
  });
};
