import { validateJobProgressReport } from "@anysub/contracts";
import { httpErrorFrom } from "$lib/server/http/errors";
import { reportProgress } from "$lib/server/jobs/lease";
import {
  authenticateWorkerReport,
  rejectLease,
} from "$lib/server/workers/request";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async (event) => {
  const report = await authenticateWorkerReport(
    event,
    validateJobProgressReport,
    "progress update",
  );
  let accepted: boolean;
  try {
    accepted = reportProgress(
      event.params.jobId,
      report.leaseToken,
      report.progress,
      report.message,
    );
  } catch (cause) {
    httpErrorFrom(cause);
  }
  if (!accepted) rejectLease();
  return json({ accepted: true });
};
