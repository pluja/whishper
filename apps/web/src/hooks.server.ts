import { building } from "$app/environment";
import { announceSetupCode } from "$lib/server/auth/setup-code";
import { db } from "$lib/server/db";
import { assertSecureRuntimeConfiguration } from "$lib/server/env";
import {
  authenticateWorkers,
  handleUploads,
  loadSession,
  logServerErrors,
  rejectCrossOriginRequests,
  requireProjectApiSession,
} from "$lib/server/http/hooks";
import { startJobMaintenance } from "$lib/server/jobs/maintenance";
import { startUploadCleanup } from "$lib/server/uploads/tus-server";
import { publishWorkerToken } from "$lib/server/workers/token";
import type { ServerInit } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";

export const init: ServerInit = async () => {
  assertSecureRuntimeConfiguration();
  if (building) return;
  await publishWorkerToken();
  startUploadCleanup();
  startJobMaintenance();
  announceSetupCode();
  process.once("sveltekit:shutdown", () => db.$client.close());
};

export const handle = sequence(
  rejectCrossOriginRequests,
  authenticateWorkers,
  loadSession,
  requireProjectApiSession,
  handleUploads,
);

export const handleError = logServerErrors;
