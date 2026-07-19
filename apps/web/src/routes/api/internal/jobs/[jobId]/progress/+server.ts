import { reportProgress } from "$lib/server/queue";
import { requireWorker } from "$lib/server/worker-auth";
import { error, json, type RequestHandler } from "@sveltejs/kit";

export const POST: RequestHandler = async (event) => {
  requireWorker(event);
  const jobId = event.params.jobId;
  if (!jobId) error(400, "Job ID is required");
  const body = await event.request.json();
  const progress = Number(body.progress);
  if (
    typeof body.leaseToken !== "string" ||
    typeof body.message !== "string" ||
    !Number.isFinite(progress) ||
    progress < 0 ||
    progress > 1
  ) {
    error(400, "Invalid progress update");
  }
  if (!(await reportProgress(jobId, body.leaseToken, progress, body.message))) {
    error(409, "Lease is no longer active");
  }
  return json({ accepted: true });
};
