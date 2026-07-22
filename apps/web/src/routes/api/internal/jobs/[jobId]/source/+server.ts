import {
  openMediaPreparationSource,
  requireMediaPreparationLease,
} from "$lib/server/media-preparation";
import { requireWorker } from "$lib/server/worker-auth";
import { error, type RequestHandler } from "@sveltejs/kit";

export const GET: RequestHandler = async (event) => {
  requireWorker(event);
  const jobId = event.params.jobId;
  const leaseToken = event.request.headers.get("x-anysub-lease-token");
  if (!jobId || !leaseToken) error(400, "An active lease is required");

  try {
    const lease = await requireMediaPreparationLease(jobId, leaseToken);
    const source = await openMediaPreparationSource(lease);
    return new Response(source.stream, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Length": String(source.sizeBytes),
        "Content-Type": source.mediaType,
      },
    });
  } catch (cause) {
    const status =
      cause instanceof Error && "statusCode" in cause
        ? Number(cause.statusCode)
        : 500;
    error(
      status,
      status === 500 || !(cause instanceof Error)
        ? "Source transfer failed"
        : cause.message,
    );
  }
};
