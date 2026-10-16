import { projectForUser } from "$lib/server/projects/access";
import { requireUser } from "$lib/server/auth/session";
import { pool } from "$lib/server/db";
import { safeMediaType, streamMediaFile } from "$lib/server/media/stream";
import { resolveDataPath } from "$lib/server/storage/paths";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, params, request }) => {
  const user = requireUser(locals);
  const project = await projectForUser(pool, params.projectId, user.id);
  if (!project?.mediaOriginalKey) error(404, "Media not found");
  const upload = await pool.query<{ media_type: string | null }>(
    "select media_type from media_uploads where project_id = $1",
    [project.id],
  );

  const path = resolveDataPath(project.mediaOriginalKey);
  const response = await streamMediaFile(
    path,
    safeMediaType(upload.rows[0]?.media_type),
    request,
  );
  if (!response) error(404, "Media not found");
  return response;
};
