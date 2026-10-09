import { projectForUser, requireUser } from "$lib/server/access";
import { pool } from "$lib/server/db";
import { streamMediaFile } from "$lib/server/media-stream";
import { isMediaDerivativeKind } from "$lib/server/media-preparation";
import { resolveDataPath } from "$lib/server/media";
import { error, type RequestHandler } from "@sveltejs/kit";

export const GET: RequestHandler = async ({ locals, params, request }) => {
  const user = requireUser(locals);
  const kind = params.kind;
  if (!kind || !isMediaDerivativeKind(kind)) error(404, "Derivative not found");

  const project = await projectForUser(params.projectId, user.id);
  if (!project) error(404, "Derivative not found");

  const result = await pool.query<{
    storage_key: string;
    media_type: string;
  }>(
    `select derivative.storage_key, derivative.media_type
       from media_derivatives derivative
      where derivative.project_id = $1
        and derivative.kind = $2
        and derivative.status = 'ready'`,
    [project.id, kind],
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
