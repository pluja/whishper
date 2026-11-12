import { apiEndpoint, json } from "#lib/server/api/handler.ts";
import { modelsForApi } from "#lib/server/api/models.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = (event) =>
  apiEndpoint(event, () => json({ models: modelsForApi() }));
