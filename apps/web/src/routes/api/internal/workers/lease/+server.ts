import { leaseJob } from "$lib/server/jobs/lease";
import { parseWorkerManifest } from "$lib/server/workers/manifest";
import { requireWorker } from "$lib/server/workers/auth";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

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
