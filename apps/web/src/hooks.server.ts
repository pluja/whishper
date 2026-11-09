import { building, dev } from "$app/environment";
import { pool } from "$lib/server/db";
import { assertSecureRuntimeConfiguration } from "$lib/server/env";
import {
  authenticateWorkers,
  handleUploads,
  loadSession,
  logServerErrors,
  rejectCrossOriginRequests,
  requireProjectApiSession,
} from "$lib/server/http/hooks";
import { startUploadCleanup } from "$lib/server/uploads/tus-server";
import type { ServerInit } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";

export const init: ServerInit = () => {
  assertSecureRuntimeConfiguration({ dev });
  if (building) return;
  startUploadCleanup();
  process.once("sveltekit:shutdown", () => void pool.end());
};

export const handle = sequence(
  rejectCrossOriginRequests,
  authenticateWorkers,
  loadSession,
  requireProjectApiSession,
  handleUploads,
);

export const handleError = logServerErrors;
