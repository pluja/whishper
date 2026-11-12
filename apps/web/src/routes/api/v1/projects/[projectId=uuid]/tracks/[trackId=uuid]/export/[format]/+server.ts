import { apiEndpoint } from "#lib/server/api/handler.ts";
import { exportTrackForUser } from "#lib/server/subtitles/export.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = (event) =>
  apiEndpoint(event, (user) =>
    exportTrackForUser(
      user.id,
      event.params.projectId,
      event.params.trackId,
      event.params.format,
    ),
  );
