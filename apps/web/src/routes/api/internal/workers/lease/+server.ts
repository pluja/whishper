import { leaseJob, WORKER_POLL_INTERVAL_MS } from "$lib/server/jobs/lease";
import { parseWorkerManifest } from "$lib/server/workers/manifest";
import { authenticateWorker } from "$lib/server/workers/auth";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async (event) => {
  authenticateWorker(event);
  let manifest;
  try {
    manifest = parseWorkerManifest(await event.request.json());
  } catch (cause) {
    error(
      400,
      cause instanceof Error ? cause.message : "Invalid worker manifest",
    );
  }
  return json({
    lease: await leaseJob(manifest),
    pollAfterMs: WORKER_POLL_INTERVAL_MS,
  });
};
