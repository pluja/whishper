import { validateJobProgressReport } from "@anysub/contracts";
import { reportProgress } from "$lib/server/jobs/lease";
import { readWorkerReport } from "$lib/server/workers/request";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async (event) => {
  const report = await readWorkerReport(
    event,
    validateJobProgressReport,
    "progress update",
  );
  if (
    !(await reportProgress(
      event.params.jobId,
      report.leaseToken,
      report.progress,
      report.message,
    ))
  ) {
    error(409, "Lease is no longer active");
  }
  return json({ accepted: true });
};
