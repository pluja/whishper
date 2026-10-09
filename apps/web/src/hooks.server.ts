import { building, dev } from "$app/environment";
import { auth } from "$lib/server/auth";
import { assertSecureRuntimeConfiguration, privateEnv } from "$lib/server/env";
import {
  handleUploadRequest,
  isUploadPath,
  startUploadCleanup,
} from "$lib/server/uploads";
import { svelteKitHandler } from "better-auth/svelte-kit";
import type { Handle, ServerInit } from "@sveltejs/kit";

export const init: ServerInit = () => {
  assertSecureRuntimeConfiguration({ dev });
  if (!building) startUploadCleanup();
};

export const handle: Handle = async ({ event, resolve }) => {
  const current = await auth.api.getSession({ headers: event.request.headers });
  event.locals.session = current?.session ?? null;
  event.locals.user = current?.user ?? null;

  if (isUploadPath(event.url.pathname)) {
    if (!event.locals.user) {
      return new Response("Authentication required.\n", { status: 401 });
    }
    const origin = event.request.headers.get("origin");
    if (origin && origin !== new URL(privateEnv.authUrl).origin) {
      return new Response("Origin not allowed.\n", { status: 403 });
    }
    return handleUploadRequest(event.request, event.locals.user.id);
  }

  return svelteKitHandler({ event, resolve, auth, building });
};
