import { httpErrorFrom } from "$lib/server/http/errors";
import {
  openMediaPreparationSource,
  requireMediaPreparationLease,
} from "$lib/server/media/artifact-staging";
import { authenticateLeaseToken } from "$lib/server/workers/request";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async (event) => {
  const leaseToken = authenticateLeaseToken(event);
  const source = await requireMediaPreparationLease(
    event.params.jobId,
    leaseToken,
  )
    .then(openMediaPreparationSource)
    .catch(httpErrorFrom);
  return new Response(source.stream, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Length": String(source.sizeBytes),
      "Content-Type": source.mediaType,
    },
  });
};
