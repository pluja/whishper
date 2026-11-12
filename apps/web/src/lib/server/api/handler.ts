import type { RequestEvent } from "@sveltejs/kit";
import type { z } from "zod";

import {
  apiError,
  apiErrorFrom,
  MISSING_TOKEN_MESSAGE,
} from "#lib/server/api/errors.ts";
import type { SessionUser } from "#lib/server/auth/session.ts";
import { badRequest } from "#lib/server/http/errors.ts";
import { requiredScope } from "#lib/shared/api-tokens.ts";

// Wraps an endpoint: the token must allow the request's method, and every
// failure becomes a JSON error.
export async function apiEndpoint(
  event: RequestEvent,
  work: (user: SessionUser) => Response | Promise<Response>,
): Promise<Response> {
  const { user, apiScope } = event.locals;
  if (!user || !apiScope) return apiError(401, MISSING_TOKEN_MESSAGE);
  if (requiredScope(event.request.method) === "write" && apiScope !== "write") {
    return apiError(403, "This token is read only.");
  }
  try {
    return await work(user);
  } catch (cause) {
    return apiErrorFrom(cause, event.request);
  }
}

export async function readJsonBody<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
): Promise<z.infer<Schema>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw badRequest("Send a JSON body.");
  }
  return parseInput(schema, body);
}

export function readQuery<Schema extends z.ZodType>(
  url: URL,
  schema: Schema,
): z.infer<Schema> {
  return parseInput(schema, Object.fromEntries(url.searchParams));
}

function parseInput<Schema extends z.ZodType>(
  schema: Schema,
  input: unknown,
): z.infer<Schema> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const field = issue?.path.join(".");
  throw badRequest(
    field
      ? `${field}: ${issue?.message}`
      : (issue?.message ?? "Invalid input."),
  );
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
