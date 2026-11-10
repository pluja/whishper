import { db } from "$lib/server/db";
import { projectForUser } from "$lib/server/projects/access";
import { requireUser } from "$lib/server/auth/session";
import { studioStatus } from "$lib/server/projects/studio";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, params }) => {
  const user = requireUser(locals);
  const project = projectForUser(db, params.projectId, user.id);
  if (!project) error(404, "Project not found");

  return json(studioStatus(db, project.id), {
    headers: { "Cache-Control": "private, no-store" },
  });
};
