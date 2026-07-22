import { pool } from "$lib/server/db";
import { streamMediaFile } from "$lib/server/media-stream";
import { resolveDataPath } from "$lib/server/media";
import { error, type RequestHandler } from "@sveltejs/kit";

export const GET: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) error(401, "Authentication required");
  const media = await pool.query<{
    media_original_key: string;
    media_type: string | null;
  }>(
    `select p.media_original_key, upload.media_type
       from projects p
       join memberships m on m.workspace_id = p.workspace_id
       left join media_uploads upload on upload.project_id = p.id
      where p.id = $1 and m.user_id = $2 and p.media_original_key is not null`,
    [params.projectId, locals.user.id],
  );
  const source = media.rows[0];
  if (!source) error(404, "Media not found");

  const path = resolveDataPath(source.media_original_key);
  const response = await streamMediaFile(
    path,
    source.media_type || "application/octet-stream",
    request,
  );
  if (!response) error(404, "Media not found");
  return response;
};
