import { pool } from "$lib/server/db";
import { projectForUser } from "$lib/server/projects/access";
import { requireUser } from "$lib/server/auth/session";
import { listTrackCues } from "$lib/server/subtitles/cues";
import { latestTrackForProject } from "$lib/server/subtitles/tracks";
import { renderWebVtt } from "$lib/shared/subtitles";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, params }) => {
  const user = requireUser(locals);
  const project = await projectForUser(pool, params.projectId, user.id);
  if (!project) error(404, "Captions not found");

  const track = await latestTrackForProject(pool, project.id);
  const cues = track ? await listTrackCues(pool, track.id) : [];
  if (cues.length === 0) error(404, "Captions not found");

  return new Response(renderWebVtt(cues), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "text/vtt; charset=utf-8",
    },
  });
};
