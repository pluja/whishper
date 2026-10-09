import {
  parseProtocolMessage,
  validateJobCompletionReport,
} from "@anysub/contracts";
import { completeJob } from "$lib/server/queue";
import { requireWorker } from "$lib/server/worker-auth";
import { error, json, type RequestHandler } from "@sveltejs/kit";

export const POST: RequestHandler = async (event) => {
  requireWorker(event);
  const jobId = event.params.jobId;
  if (!jobId) error(400, "Job ID is required");
  const report = parseProtocolMessage(
    validateJobCompletionReport,
    await event.request.json(),
  );
  if (!report.ok) error(400, `Invalid completion: ${report.errors.join("; ")}`);
  const outcome = await completeJob(
    jobId,
    report.value.leaseToken,
    report.value.result,
  );
  if (outcome === "lease-rejected") error(409, "Lease is no longer active");
  return json({ accepted: true, outcome });
};
