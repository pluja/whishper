import {
  parseTrackUpdate,
  TrackRevisionConflict,
  TrackValidationError,
  updateTrackForUser,
} from "$lib/server/subtitle-editor";
import { error, json, type RequestHandler } from "@sveltejs/kit";

export const PUT: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) error(401, "Authentication required");
  const projectId = params.projectId;
  const trackId = params.trackId;
  if (!projectId || !trackId) error(400, "Project and track IDs are required");

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
      projectId,
      trackId,
      locals.user.id,
      update,
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
    if (cause instanceof TrackValidationError) {
      return json({ message: cause.message }, { status: 400 });
    }
    console.error("Could not save subtitle track", cause);
    return json(
      {
        message:
          cause instanceof Error
            ? cause.message
            : "The subtitle track could not be saved.",
      },
      { status: 500 },
    );
  }
};
