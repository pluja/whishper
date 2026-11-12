import { apiEndpoint, json } from "#lib/server/api/handler.ts";
import {
  deleteProjectForApi,
  projectForApi,
} from "#lib/server/api/projects.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = (event) =>
  apiEndpoint(event, (user) =>
    json(projectForApi(user.id, event.params.projectId)),
  );

export const DELETE: RequestHandler = (event) =>
  apiEndpoint(event, async (user) => {
    await deleteProjectForApi(user.id, event.params.projectId);
    return new Response(null, { status: 204 });
  });
