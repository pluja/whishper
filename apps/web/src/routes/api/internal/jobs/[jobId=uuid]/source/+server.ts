import { httpErrorFrom } from "$lib/server/http/errors";
import {
  openMediaPreparationSource,
  requireMediaPreparationLease,
} from "$lib/server/media/artifact-staging";
import { authenticateLeaseToken } from "$lib/server/workers/request";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async (event) => {
  const leaseToken = authenticateLeaseToken(event);
  let source: Awaited<ReturnType<typeof openMediaPreparationSource>>;
  try {
    source = await openMediaPreparationSource(
      requireMediaPreparationLease(event.params.jobId, leaseToken),
    );
  } catch (cause) {
    httpErrorFrom(cause);
  }
  return new Response(source.stream, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Length": String(source.sizeBytes),
      "Content-Type": source.mediaType,
    },
  });
};
