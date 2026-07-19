import type { JobCompletion } from "@anysub/contracts";
import { completeJob } from "$lib/server/queue";
import { requireWorker } from "$lib/server/worker-auth";
import { error, json, type RequestHandler } from "@sveltejs/kit";

export const POST: RequestHandler = async (event) => {
  requireWorker(event);
  const jobId = event.params.jobId;
  if (!jobId) error(400, "Job ID is required");
  const body = await event.request.json();
  if (typeof body.leaseToken !== "string" || !body.result)
    error(400, "Invalid completion");
  const outcome = await completeJob(
    jobId,
    body.leaseToken,
    body.result as JobCompletion,
  );
  if (outcome === "lease-rejected") error(409, "Lease is no longer active");
  return json({ accepted: true, outcome });
};
