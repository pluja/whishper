import { pool } from "$lib/server/db";
import { streamMediaFile } from "$lib/server/media-stream";
import { isMediaDerivativeKind } from "$lib/server/media-preparation";
import { resolveDataPath } from "$lib/server/media";
import { error, type RequestHandler } from "@sveltejs/kit";

export const GET: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) error(401, "Authentication required");
  const kind = params.kind;
  if (!kind || !isMediaDerivativeKind(kind)) error(404, "Derivative not found");

  const result = await pool.query<{
    storage_key: string;
    media_type: string;
  }>(
    `select derivative.storage_key, derivative.media_type
       from media_derivatives derivative
       join projects p on p.id = derivative.project_id
       join memberships m on m.workspace_id = p.workspace_id
      where derivative.project_id = $1
        and derivative.kind = $2
        and derivative.status = 'ready'
        and m.user_id = $3`,
    [params.projectId, kind, locals.user.id],
  );
  const derivative = result.rows[0];
  if (!derivative) error(404, "Derivative not found");

  const response = await streamMediaFile(
    resolveDataPath(derivative.storage_key),
    derivative.media_type,
    request,
  );
  if (!response) error(404, "Derivative not found");
  return response;
};
