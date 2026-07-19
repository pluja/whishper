import { pool } from "$lib/server/db";
import { error, type RequestHandler } from "@sveltejs/kit";

export const GET: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) error(401, "Authentication required");
  const cues = await pool.query<{
    position: number;
    start_us: number;
    end_us: number;
    text: string;
  }>(
    `select c.position, c.start_us, c.end_us, c.text
       from cues c
       join subtitle_tracks track on track.id = c.track_id
       join projects p on p.id = track.project_id
       join memberships m on m.workspace_id = p.workspace_id
      where p.id = $1 and m.user_id = $2
        and track.id = (
          select id from subtitle_tracks
           where project_id = p.id order by created_at desc limit 1
        )
      order by c.position asc`,
    [params.projectId, locals.user.id],
  );
  if (!cues.rowCount) error(404, "Captions not found");

  const body = [
    "WEBVTT",
    "",
    ...cues.rows.flatMap((cue) => [
      String(cue.position + 1),
      `${_vttTime(cue.start_us)} --> ${_vttTime(cue.end_us)}`,
      cue.text,
      "",
    ]),
  ].join("\n");
  return new Response(body, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "text/vtt; charset=utf-8",
    },
  });
};

export function _vttTime(microseconds: number): string {
  const milliseconds = Math.max(0, Math.floor(microseconds / 1_000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1_000);
  const remainder = milliseconds % 1_000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(remainder).padStart(3, "0")}`;
}
