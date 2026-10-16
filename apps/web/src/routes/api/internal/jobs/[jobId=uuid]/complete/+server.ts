import { validateJobCompletionReport } from "@anysub/contracts";
import { httpErrorFrom } from "$lib/server/http/errors";
import { completeJob } from "$lib/server/jobs/completion";
import { readWorkerReport } from "$lib/server/workers/request";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async (event) => {
  const report = await readWorkerReport(
    event,
    validateJobCompletionReport,
    "completion",
  );
  let outcome;
  try {
    outcome = await completeJob(
      event.params.jobId,
      report.leaseToken,
      report.result,
    );
  } catch (cause) {
    console.error(`Could not complete job ${event.params.jobId}`, cause);
    httpErrorFrom(cause, "Job completion failed");
  }
  if (outcome === "lease-rejected") error(409, "Lease is no longer active");
  return json({ accepted: true, outcome });
};
