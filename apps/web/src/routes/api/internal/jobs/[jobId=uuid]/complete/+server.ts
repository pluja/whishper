import { validateJobCompletionReport } from "@anysub/contracts";
import { completeJob } from "$lib/server/queue";
import { readWorkerReport } from "$lib/server/worker-request";
import { error, json, type RequestHandler } from "@sveltejs/kit";

export const POST: RequestHandler = async (event) => {
  const report = await readWorkerReport(
    event,
    validateJobCompletionReport,
    "completion",
  );
  const outcome = await completeJob(
    event.params.jobId!,
    report.leaseToken,
    report.result,
  );
  if (outcome === "lease-rejected") error(409, "Lease is no longer active");
  return json({ accepted: true, outcome });
};
