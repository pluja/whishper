import { httpErrorFrom } from "$lib/server/http-error";
import {
  openMediaPreparationSource,
  requireMediaPreparationLease,
} from "$lib/server/media-preparation";
import { requireWorkerLeaseToken } from "$lib/server/worker-request";
import type { RequestHandler } from "@sveltejs/kit";

export const GET: RequestHandler = async (event) => {
  const leaseToken = requireWorkerLeaseToken(event);

  try {
    const lease = await requireMediaPreparationLease(
      event.params.jobId!,
      leaseToken,
    );
    const source = await openMediaPreparationSource(lease);
    return new Response(source.stream, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Length": String(source.sizeBytes),
        "Content-Type": source.mediaType,
      },
    });
  } catch (cause) {
    httpErrorFrom(cause, "Source transfer failed");
  }
};
