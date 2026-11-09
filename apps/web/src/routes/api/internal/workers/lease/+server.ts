import { json } from "@sveltejs/kit";

import { leaseJob, WORKER_POLL_INTERVAL_MS } from "$lib/server/jobs/lease";
import { authenticateWorkerManifest } from "$lib/server/workers/request";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async (event) => {
  const manifest = await authenticateWorkerManifest(event);
  return json({
    lease: await leaseJob(manifest),
    pollAfterMs: WORKER_POLL_INTERVAL_MS,
  });
};
