import { building, dev } from "$app/environment";
import { auth } from "$lib/server/auth/auth";
import { pool } from "$lib/server/db";
import { assertSecureRuntimeConfiguration } from "$lib/server/env";
import {
  authenticateWorkers,
  handleUploads,
  loadSession,
  logServerErrors,
  requireProjectApiSession,
} from "$lib/server/http/hooks";
import { startUploadCleanup } from "$lib/server/uploads/tus-server";
import { svelteKitHandler } from "better-auth/svelte-kit";
import type { Handle, ServerInit } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";

export const init: ServerInit = () => {
  assertSecureRuntimeConfiguration({ dev });
  if (building) return;
  startUploadCleanup();
  process.once("sveltekit:shutdown", () => void pool.end());
};

const betterAuth: Handle = ({ event, resolve }) =>
  svelteKitHandler({ event, resolve, auth, building });

export const handle = sequence(
  authenticateWorkers,
  loadSession,
  requireProjectApiSession,
  handleUploads,
  betterAuth,
);

export const handleError = logServerErrors;
