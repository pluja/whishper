import { apiEndpoint, json } from "#lib/server/api/handler.ts";
import { trackForUser } from "#lib/server/api/tracks.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = (event) =>
  apiEndpoint(event, (user) =>
    json(trackForUser(user.id, event.params.projectId, event.params.trackId)),
  );
