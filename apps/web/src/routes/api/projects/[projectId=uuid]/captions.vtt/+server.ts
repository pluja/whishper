import { db } from "#lib/server/db/index.ts";
import { projectForUser } from "#lib/server/projects/access.ts";
import { requireUser } from "#lib/server/auth/session.ts";
import { listTrackCues } from "#lib/server/subtitles/cues.ts";
import { latestTrackForProject } from "#lib/server/subtitles/tracks.ts";
import { renderWebVtt } from "#lib/shared/subtitles.ts";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, params }) => {
  const user = requireUser(locals);
  const project = projectForUser(db, params.projectId, user.id);
  if (!project) error(404, "Captions not found");

  const track = latestTrackForProject(db, project.id);
  const cues = track ? listTrackCues(db, track.id) : [];
  if (cues.length === 0) error(404, "Captions not found");

  return new Response(renderWebVtt(cues), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "text/vtt; charset=utf-8",
    },
  });
};
