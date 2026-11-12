import { db } from "#lib/server/db/index.ts";
import { projectForUser } from "#lib/server/projects/access.ts";
import { requireUser } from "#lib/server/auth/session.ts";
import { studioStatus } from "#lib/server/projects/studio.ts";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, params }) => {
  const user = requireUser(locals);
  const project = projectForUser(db, params.projectId, user.id);
  if (!project) error(404, "Project not found");

  return Response.json(studioStatus(db, project.id), {
    headers: { "Cache-Control": "private, no-store" },
  });
};
