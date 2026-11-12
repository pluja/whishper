import { validateJobCompletionReport } from "@anysub/contracts";
import { httpErrorFrom } from "#lib/server/http/errors.ts";
import { completeJob } from "#lib/server/jobs/completion.ts";
import {
  authenticateWorkerReport,
  rejectLease,
} from "#lib/server/workers/request.ts";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async (event) => {
  const report = await authenticateWorkerReport(
    event,
    validateJobCompletionReport,
    "completion",
  );
  const outcome = await completeJob(
    event.params.jobId,
    report.leaseToken,
    report.result,
  ).catch(httpErrorFrom);
  if (outcome === "lease-rejected") rejectLease();
  return Response.json({ accepted: true, outcome });
};
