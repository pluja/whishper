import { validateJobFailureReport } from "@anysub/contracts";
import { failJob } from "$lib/server/queue";
import { readWorkerReport } from "$lib/server/worker-request";
import { error, json, type RequestHandler } from "@sveltejs/kit";

export const POST: RequestHandler = async (event) => {
  const report = await readWorkerReport(
    event,
    validateJobFailureReport,
    "failure report",
  );
  if (!(await failJob(event.params.jobId!, report.leaseToken, report.error))) {
    error(409, "Lease is no longer active");
  }
  return json({ accepted: true });
};
