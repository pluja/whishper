import type { Handle, HandleServerError } from "@sveltejs/kit/hooks";
import { apiError, MISSING_TOKEN_MESSAGE } from "#lib/server/api/errors.ts";
import { authenticateApiToken } from "#lib/server/auth/api-tokens.ts";
import { auth } from "#lib/server/auth/auth.ts";
import { isCrossOriginRequest } from "#lib/server/http/cross-origin.ts";
import { ServerFailure } from "#lib/server/http/errors.ts";
import {
  handleUploadRequest,
  isUploadPath,
} from "#lib/server/uploads/tus-server.ts";
import { isAuthenticatedWorker } from "#lib/server/workers/auth.ts";

const WORKER_API = "/api/internal";
const PUBLIC_API = "/api/v1";
// Readable without a token, so tools can fetch the description first.
const PUBLIC_API_DESCRIPTION = "/api/v1/openapi.json";
const PROJECT_API = "/api/projects";
const HEALTH_API = "/api/health";

function isWithin(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export const rejectCrossOriginRequests: Handle = ({ event, resolve }) => {
  if (isCrossOriginRequest(event.request)) {
    return new Response("Cross-origin request blocked.\n", { status: 403 });
  }
  return resolve(event);
};

export const authenticateWorkers: Handle = ({ event, resolve }) => {
  if (!isWithin(event.url.pathname, WORKER_API)) return resolve(event);
  if (!isAuthenticatedWorker(event.request)) {
    return Response.json(
      { message: "Worker authentication failed" },
      { status: 401 },
    );
  }
  return resolve(event);
};

// Workers and health probes never hold a browser session, so they skip the
// database lookup. The public API ignores cookies: only a token counts there,
// so a signed-in browser cannot be made to call it.
export const loadSession: Handle = async ({ event, resolve }) => {
  event.locals.session = null;
  event.locals.user = null;
  event.locals.apiScope = null;
  const { pathname } = event.url;
  if (
    isWithin(pathname, WORKER_API) ||
    isWithin(pathname, HEALTH_API) ||
    isWithin(pathname, PUBLIC_API)
  ) {
    return resolve(event);
  }
  const current = await auth.api.getSession({ headers: event.request.headers });
  event.locals.session = current?.session ?? null;
  event.locals.user = current?.user ?? null;
  return resolve(event);
};

// Covers the public API, and resumable uploads sent with a token instead of
// a session.
export const authenticateApiTokens: Handle = ({ event, resolve }) => {
  const { pathname } = event.url;
  const authorization = event.request.headers.get("authorization");
  const tokenUpload =
    isUploadPath(pathname) && authorization?.startsWith("Bearer ");
  if (!tokenUpload && !isWithin(pathname, PUBLIC_API)) return resolve(event);
  if (pathname === PUBLIC_API_DESCRIPTION) return resolve(event);
  const caller = authenticateApiToken(authorization);
  if (!caller) {
    return apiError(401, MISSING_TOKEN_MESSAGE);
  }
  if (tokenUpload && caller.scope !== "write") {
    return apiError(403, "Uploading needs a token that can read and write.");
  }
  event.locals.user = caller.user;
  event.locals.apiScope = caller.scope;
  return resolve(event);
};

export const requireProjectApiSession: Handle = ({ event, resolve }) => {
  if (isWithin(event.url.pathname, PROJECT_API) && !event.locals.user) {
    return Response.json(
      { message: "Authentication required" },
      { status: 401 },
    );
  }
  return resolve(event);
};

export const handleUploads: Handle = ({ event, resolve }) => {
  if (!isUploadPath(event.url.pathname)) return resolve(event);
  if (!event.locals.user) {
    return new Response("Authentication required.\n", { status: 401 });
  }
  return handleUploadRequest(event.request, event.locals.user.id);
};

// Expected errors (error(...) and SvelteKit's own, such as a 404) keep their
// status and message. Only unexpected ones are logged, and they show a generic
// message unless they carry a public one.
export const logServerErrors: HandleServerError = ({ kind, error, event }) => {
  if (kind !== "unknown") return;
  console.error(`${event.request.method} ${event.url.pathname} failed`, error);
  if (error instanceof ServerFailure) return { message: error.message };
};
