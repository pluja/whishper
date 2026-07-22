import {
  appendArtifactChunk,
  ArtifactOffsetError,
  isMediaDerivativeKind,
  requireMediaPreparationLease,
  stagedArtifactOffset,
} from "$lib/server/media-preparation";
import { requireWorker } from "$lib/server/worker-auth";
import { error, type RequestEvent, type RequestHandler } from "@sveltejs/kit";

async function activeArtifactLease(event: RequestEvent) {
  requireWorker(event);
  const jobId = event.params.jobId;
  const kind = event.params.kind;
  const leaseToken = event.request.headers.get("x-anysub-lease-token");
  if (!jobId || !kind || !leaseToken || !isMediaDerivativeKind(kind)) {
    error(400, "A valid derivative kind and active lease are required");
  }
  try {
    return {
      kind,
      lease: await requireMediaPreparationLease(jobId, leaseToken),
    };
  } catch (cause) {
    const status =
      cause instanceof Error && "statusCode" in cause
        ? Number(cause.statusCode)
        : 500;
    error(
      status,
      status === 500 || !(cause instanceof Error)
        ? "Artifact transfer failed"
        : cause.message,
    );
  }
}

export const HEAD: RequestHandler = async (event) => {
  const { kind, lease } = await activeArtifactLease(event);
  return new Response(null, {
    headers: {
      "Cache-Control": "no-store",
      "Upload-Offset": String(await stagedArtifactOffset(lease, kind)),
    },
  });
};

export const PATCH: RequestHandler = async (event) => {
  const { kind, lease } = await activeArtifactLease(event);
  const offset = Number(event.request.headers.get("upload-offset"));
  const uploadLength = Number(event.request.headers.get("upload-length"));
  const contentLength = Number(event.request.headers.get("content-length"));
  if (!event.request.body) error(400, "Artifact chunk body is required");

  try {
    const nextOffset = await appendArtifactChunk(
      lease,
      kind,
      offset,
      uploadLength,
      contentLength,
      event.request.body,
    );
    return new Response(null, {
      status: 204,
      headers: {
        "Cache-Control": "no-store",
        "Upload-Offset": String(nextOffset),
      },
    });
  } catch (cause) {
    if (cause instanceof ArtifactOffsetError) {
      return new Response(null, {
        status: 409,
        headers: { "Upload-Offset": String(cause.currentOffset) },
      });
    }
    const status =
      cause instanceof Error && "statusCode" in cause
        ? Number(cause.statusCode)
        : 500;
    error(
      status,
      status === 500 || !(cause instanceof Error)
        ? "Artifact upload failed"
        : cause.message,
    );
  }
};
