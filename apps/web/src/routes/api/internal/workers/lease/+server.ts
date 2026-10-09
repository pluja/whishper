import { leaseJob, parseWorkerManifest } from "$lib/server/queue";
import { requireWorker } from "$lib/server/worker-auth";
import { error, json, type RequestHandler } from "@sveltejs/kit";

export const POST: RequestHandler = async (event) => {
  requireWorker(event);
  let manifest;
  try {
    manifest = parseWorkerManifest(await event.request.json());
  } catch (cause) {
    error(
      400,
      cause instanceof Error ? cause.message : "Invalid worker manifest",
    );
  }
  return json({ lease: await leaseJob(manifest), pollAfterMs: 2_000 });
};
