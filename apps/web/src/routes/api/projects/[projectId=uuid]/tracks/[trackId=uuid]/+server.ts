import { requireUser } from "$lib/server/auth/session";
import {
  parseTrackUpdate,
  TrackLockedByTranscription,
  TrackRevisionConflict,
  TrackValidationError,
  updateTrackForUser,
} from "$lib/server/subtitles/track-editor";
import { ServerFailure } from "$lib/server/http/errors";
import { error, isHttpError, json } from "@sveltejs/kit";
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
    const revision = await updateTrackForUser(
      params.projectId,
      params.trackId,
      user.id,
      await readTrackUpdate(request),
    );
    if (revision === null) error(404, "Subtitle track not found");
    return json({ revision });
  } catch (cause) {
    if (cause instanceof TrackRevisionConflict) {
      return json(
        {
          code: "revision_conflict",
          message: cause.message,
          revision: cause.currentRevision,
        },
        { status: 409 },
      );
    }
    if (cause instanceof TrackLockedByTranscription) {
      return json(
        { code: "transcription_running", message: cause.message },
        { status: 409 },
      );
    }
    if (cause instanceof TrackValidationError) {
      return json({ message: cause.message }, { status: 400 });
    }
    if (isHttpError(cause)) throw cause;
    throw new ServerFailure("The subtitle track could not be saved.", {
      cause,
    });
  }
};
