import { apiEndpoint, json } from "#lib/server/api/handler.ts";
import { workspacesForUser } from "#lib/server/api/projects.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = (event) =>
  apiEndpoint(event, (user) =>
    json({
      id: user.id,
      name: user.name,
      email: user.email,
      workspaces: workspacesForUser(user.id),
    }),
  );
