import { apiEndpoint, json } from "#lib/server/api/handler.ts";
import { tracksForUser } from "#lib/server/api/tracks.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = (event) =>
  apiEndpoint(event, (user) =>
    json({ tracks: tracksForUser(user.id, event.params.projectId) }),
  );
