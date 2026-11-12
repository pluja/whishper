import { openApiDocument } from "#lib/server/api/openapi.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = () => Response.json(openApiDocument());
