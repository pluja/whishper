import { building } from "$app/env";
import { announceSetupCode } from "#lib/server/auth/setup-code.ts";
import { db } from "#lib/server/db/index.ts";
import { assertSecureRuntimeConfiguration } from "#lib/server/env.ts";
import {
  authenticateWorkers,
  handleUploads,
  loadSession,
  logServerErrors,
  rejectCrossOriginRequests,
  requireProjectApiSession,
} from "#lib/server/http/hooks.ts";
import { startJobMaintenance } from "#lib/server/jobs/maintenance.ts";
import { startUploadCleanup } from "#lib/server/uploads/tus-server.ts";
import { publishWorkerToken } from "#lib/server/workers/token.ts";
import { sequence, type ServerInit } from "@sveltejs/kit/hooks";

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
