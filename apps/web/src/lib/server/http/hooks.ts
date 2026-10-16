import { json, type Handle, type HandleServerError } from "@sveltejs/kit";

import { auth } from "$lib/server/auth/auth";
import { privateEnv } from "$lib/server/env";
import { ServerFailure } from "$lib/server/http/errors";
import {
  handleUploadRequest,
  isUploadPath,
} from "$lib/server/uploads/tus-server";
import { isAuthenticatedWorker } from "$lib/server/workers/auth";

const WORKER_API = "/api/internal";
const PROJECT_API = "/api/projects";
const HEALTH_API = "/api/health";

function isWithin(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export const authenticateWorkers: Handle = ({ event, resolve }) => {
  if (!isWithin(event.url.pathname, WORKER_API)) return resolve(event);
  if (!isAuthenticatedWorker(event.request)) {
    return json({ message: "Worker authentication failed" }, { status: 401 });
  }
  return resolve(event);
};

// Workers and health probes never hold a browser session, so they skip the
// database lookup.
export const loadSession: Handle = async ({ event, resolve }) => {
  event.locals.session = null;
  event.locals.user = null;
  const { pathname } = event.url;
  if (isWithin(pathname, WORKER_API) || isWithin(pathname, HEALTH_API)) {
    return resolve(event);
  }
  const current = await auth.api.getSession({ headers: event.request.headers });
  event.locals.session = current?.session ?? null;
  event.locals.user = current?.user ?? null;
  return resolve(event);
};

export const requireProjectApiSession: Handle = ({ event, resolve }) => {
  if (isWithin(event.url.pathname, PROJECT_API) && !event.locals.user) {
    return json({ message: "Authentication required" }, { status: 401 });
  }
  return resolve(event);
};

export const handleUploads: Handle = ({ event, resolve }) => {
  if (!isUploadPath(event.url.pathname)) return resolve(event);
  if (!event.locals.user) {
    return new Response("Authentication required.\n", { status: 401 });
  }
  const origin = event.request.headers.get("origin");
  if (origin && origin !== new URL(privateEnv.authUrl).origin) {
    return new Response("Origin not allowed.\n", { status: 403 });
  }
  return handleUploadRequest(event.request, event.locals.user.id);
};

export const logServerErrors: HandleServerError = ({
  error,
  event,
  status,
  message,
}) => {
  if (status >= 500) {
    console.error(
      `${event.request.method} ${event.url.pathname} failed`,
      error,
    );
  }
  return { message: error instanceof ServerFailure ? error.message : message };
};
