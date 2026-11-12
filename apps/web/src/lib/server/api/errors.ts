import { isHttpError } from "@sveltejs/kit";

import { clientFailure } from "#lib/server/http/errors.ts";

export const API_ERROR_CODES = [
  "invalid_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "payload_too_large",
  "internal_error",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const MISSING_TOKEN_MESSAGE =
  "Send a valid API token as Authorization: Bearer <token>.";

const CODE_BY_STATUS: Record<number, ApiErrorCode> = {
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
  413: "payload_too_large",
};

function codeFor(status: number): ApiErrorCode {
  return (
    CODE_BY_STATUS[status] ??
    (status < 500 ? "invalid_request" : "internal_error")
  );
}

export function apiError(status: number, message: string): Response {
  return Response.json(
    { error: { code: codeFor(status), message } },
    { status },
  );
}

// Client failures keep their message. Anything else is logged and answered
// generically, as the handleError hook does for pages.
export function apiErrorFrom(cause: unknown, request: Request): Response {
  if (isHttpError(cause)) {
    return apiError(cause.status, cause.body.message);
  }
  const failure = clientFailure(cause);
  if (failure) return apiError(failure.status, failure.message);
  console.error(
    `${request.method} ${new URL(request.url).pathname} failed`,
    cause,
  );
  return apiError(500, "The server could not complete the request.");
}
