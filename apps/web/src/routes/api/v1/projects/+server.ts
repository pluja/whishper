import { apiEndpoint, json, readQuery } from "#lib/server/api/handler.ts";
import {
  createProjectFromBody,
  listProjects,
} from "#lib/server/api/projects.ts";
import {
  ProjectListQuerySchema,
  ProjectUploadQuerySchema,
} from "#lib/server/api/schemas.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = (event) =>
  apiEndpoint(event, (user) =>
    json(listProjects(user.id, readQuery(event.url, ProjectListQuerySchema))),
  );

export const POST: RequestHandler = (event) =>
  apiEndpoint(event, async (user) =>
    json(
      await createProjectFromBody(
        user.id,
        event.request,
        readQuery(event.url, ProjectUploadQuerySchema),
      ),
      201,
    ),
  );
