import { httpErrorFrom } from "$lib/server/http-error";
import {
  appendArtifactChunk,
  ArtifactOffsetError,
  isMediaDerivativeKind,
  requireMediaPreparationLease,
  stagedArtifactOffset,
} from "$lib/server/media-preparation";
import { requireWorkerLeaseToken } from "$lib/server/worker-request";
import { error, type RequestEvent, type RequestHandler } from "@sveltejs/kit";

async function activeArtifactLease(event: RequestEvent) {
  const leaseToken = requireWorkerLeaseToken(event);
  const kind = event.params.kind!;
  if (!isMediaDerivativeKind(kind)) {
    error(400, "A valid derivative kind is required");
  }
  try {
    return {
      kind,
      lease: await requireMediaPreparationLease(
        event.params.jobId!,
        leaseToken,
      ),
    };
  } catch (cause) {
    httpErrorFrom(cause, "Artifact transfer failed");
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
    httpErrorFrom(cause, "Artifact upload failed");
  }
};
