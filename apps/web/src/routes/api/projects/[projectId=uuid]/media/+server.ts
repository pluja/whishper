import { projectForUser, requireUser } from "$lib/server/access";
import { pool } from "$lib/server/db";
import { safeMediaType, streamMediaFile } from "$lib/server/media-stream";
import { resolveDataPath } from "$lib/server/media";
import { error, type RequestHandler } from "@sveltejs/kit";

export const GET: RequestHandler = async ({ locals, params, request }) => {
  const user = requireUser(locals);
  const project = await projectForUser(params.projectId, user.id);
  if (!project?.media_original_key) error(404, "Media not found");
  const upload = await pool.query<{ media_type: string | null }>(
    "select media_type from media_uploads where project_id = $1",
    [project.id],
  );

  const path = resolveDataPath(project.media_original_key);
  const response = await streamMediaFile(
    path,
    safeMediaType(upload.rows[0]?.media_type),
    request,
  );
  if (!response) error(404, "Media not found");
  return response;
};
