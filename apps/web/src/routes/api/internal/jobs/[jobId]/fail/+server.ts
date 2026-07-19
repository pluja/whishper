import { failJob } from "$lib/server/queue";
import { requireWorker } from "$lib/server/worker-auth";
import { error, json, type RequestHandler } from "@sveltejs/kit";

export const POST: RequestHandler = async (event) => {
  requireWorker(event);
  const jobId = event.params.jobId;
  if (!jobId) error(400, "Job ID is required");
  const body = await event.request.json();
  if (
    typeof body.leaseToken !== "string" ||
    !body.error ||
    typeof body.error.code !== "string" ||
    typeof body.error.message !== "string" ||
    typeof body.error.retryable !== "boolean"
  ) {
    error(400, "Invalid failure report");
  }
  if (!(await failJob(jobId, body.leaseToken, body.error))) {
    error(409, "Lease is no longer active");
  }
  return json({ accepted: true });
};
