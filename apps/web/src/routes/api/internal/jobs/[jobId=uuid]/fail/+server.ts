import { validateJobFailureReport } from "@anysub/contracts";
import { httpErrorFrom } from "#lib/server/http/errors.ts";
import { failJob } from "#lib/server/jobs/failure.ts";
import {
  authenticateWorkerReport,
  rejectLease,
} from "#lib/server/workers/request.ts";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async (event) => {
  const report = await authenticateWorkerReport(
    event,
    validateJobFailureReport,
    "failure report",
  );
  const accepted = await failJob(
    event.params.jobId,
    report.leaseToken,
    report.error,
  ).catch(httpErrorFrom);
  if (!accepted) rejectLease();
  return Response.json({ accepted: true });
};
