import { requireUser } from "#lib/server/auth/session.ts";
import { httpErrorFrom } from "#lib/server/http/errors.ts";
import { exportTrackForUser } from "#lib/server/subtitles/export.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = ({ locals, params }) => {
  const user = requireUser(locals);
  try {
    return exportTrackForUser(
      user.id,
      params.projectId,
      params.trackId,
      params.format,
    );
  } catch (cause) {
    httpErrorFrom(cause);
  }
};
