import { projectForUser } from "$lib/server/projects/access";
import { requireUser } from "$lib/server/auth/session";
import { pool } from "$lib/server/db";
import { safeMediaType, streamMediaFile } from "$lib/server/media/stream";
import { resolveDataPath } from "$lib/server/storage/paths";
import { uploadMediaType } from "$lib/server/uploads/projects";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, params, request }) => {
  const user = requireUser(locals);
  const project = await projectForUser(pool, params.projectId, user.id);
  if (!project?.mediaOriginalKey) error(404, "Media not found");

  const response = await streamMediaFile(
    resolveDataPath(project.mediaOriginalKey),
    safeMediaType(await uploadMediaType(project.id)),
    request,
  );
  if (!response) error(404, "Media not found");
  return response;
};

// Without its own export, SvelteKit answers HEAD by reading the whole file.
export const HEAD = GET;
