import { leaseJob, WORKER_POLL_INTERVAL_MS } from "#lib/server/jobs/lease.ts";
import { authenticateWorkerManifest } from "#lib/server/workers/request.ts";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async (event) => {
  const manifest = await authenticateWorkerManifest(event);
  return Response.json({
    lease: await leaseJob(manifest),
    pollAfterMs: WORKER_POLL_INTERVAL_MS,
  });
};
