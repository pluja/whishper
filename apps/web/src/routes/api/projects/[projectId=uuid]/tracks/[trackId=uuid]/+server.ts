import { requireUser } from "#lib/server/auth/session.ts";
import {
  parseTrackUpdate,
  TrackLockedByTranscription,
  TrackRevisionConflict,
  TrackValidationError,
  updateTrackForUser,
} from "#lib/server/subtitles/track-editor.ts";
import { ServerFailure } from "#lib/server/http/errors.ts";
import { error, isHttpError } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

async function readTrackUpdate(request: Request) {
  const body = await request.json().catch(() => {
    throw new TrackValidationError("The track update must be valid JSON.");
  });
  return parseTrackUpdate(body);
}

export const PUT: RequestHandler = async ({ locals, params, request }) => {
  const user = requireUser(locals);
  try {
    const revision = updateTrackForUser(
      params.projectId,
      params.trackId,
      user.id,
      await readTrackUpdate(request),
    );
    if (revision === null) error(404, "Subtitle track not found");
    return Response.json({ revision });
  } catch (cause) {
    if (cause instanceof TrackRevisionConflict) {
      return Response.json(
        {
          code: "revision_conflict",
          message: cause.message,
          revision: cause.currentRevision,
        },
        { status: 409 },
      );
    }
    if (cause instanceof TrackLockedByTranscription) {
      return Response.json(
        { code: "transcription_running", message: cause.message },
        { status: 409 },
      );
    }
    if (cause instanceof TrackValidationError) {
      return Response.json({ message: cause.message }, { status: 400 });
    }
    if (isHttpError(cause)) throw cause;
    throw new ServerFailure("The subtitle track could not be saved.", {
      cause,
    });
  }
};
