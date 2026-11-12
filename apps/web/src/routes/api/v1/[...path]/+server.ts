import { apiError } from "#lib/server/api/errors.ts";
import type { RequestHandler } from "./$types";

// Answers unknown paths, and IDs that are not UUIDs, in the API's own format.
export const fallback: RequestHandler = () =>
  apiError(404, "No such endpoint. See /api/v1/openapi.json.");
