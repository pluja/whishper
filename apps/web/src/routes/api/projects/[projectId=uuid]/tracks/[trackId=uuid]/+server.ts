import { requireUser } from "$lib/server/access";
import {
  parseTrackUpdate,
  TrackRevisionConflict,
  TrackValidationError,
  updateTrackForUser,
} from "$lib/server/subtitle-editor";
import { error, isHttpError, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const PUT: RequestHandler = async ({ locals, params, request }) => {
  const user = requireUser(locals);

  let update;
  try {
    update = parseTrackUpdate(await request.json());
  } catch (cause) {
    return json(
      {
        message:
          cause instanceof Error ? cause.message : "Invalid track update.",
      },
      { status: 400 },
    );
  }

  try {
    const revision = await updateTrackForUser(
      params.projectId,
      params.trackId,
      user.id,
      update,
    );
    if (revision === null) error(404, "Subtitle track not found");
    return json({ revision });
  } catch (cause) {
    if (isHttpError(cause)) throw cause;
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
    if (cause instanceof TrackValidationError) {
      return json({ message: cause.message }, { status: 400 });
    }
    console.error("Could not save subtitle track", cause);
    error(500, "The subtitle track could not be saved.");
  }
};
