import { httpErrorFrom } from "#lib/server/http/errors.ts";
import {
  appendArtifactChunk,
  ArtifactOffsetError,
  parseUploadInteger,
  requireMediaPreparationLease,
  stagedArtifactOffset,
} from "#lib/server/media/artifact-staging.ts";
import { isMediaDerivativeKind } from "#lib/server/media/derivatives.ts";
import { authenticateLeaseToken } from "#lib/server/workers/request.ts";
import { error } from "@sveltejs/kit";
import type { RequestEvent, RequestHandler } from "./$types";

async function activeArtifactLease(event: RequestEvent) {
  const leaseToken = authenticateLeaseToken(event);
  const kind = event.params.kind;
  if (!isMediaDerivativeKind(kind)) {
    error(400, "A valid derivative kind is required");
  }
  try {
    return {
      kind,
      lease: requireMediaPreparationLease(event.params.jobId, leaseToken),
    };
  } catch (cause) {
    httpErrorFrom(cause);
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
  const offset = parseUploadInteger(event.request.headers.get("upload-offset"));
  const uploadLength = parseUploadInteger(
    event.request.headers.get("upload-length"),
  );
  const contentLength = parseUploadInteger(
    event.request.headers.get("content-length"),
  );
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
    httpErrorFrom(cause);
  }
};
