import { validateJobProgressReport } from "@anysub/contracts";
import { httpErrorFrom } from "#lib/server/http/errors.ts";
import { reportProgress } from "#lib/server/jobs/lease.ts";
import {
  authenticateWorkerReport,
  rejectLease,
} from "#lib/server/workers/request.ts";
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
  return Response.json({ accepted: true });
};
