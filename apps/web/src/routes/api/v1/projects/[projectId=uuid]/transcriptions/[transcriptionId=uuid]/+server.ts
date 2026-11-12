import { apiEndpoint, json } from "#lib/server/api/handler.ts";
import {
  cancelTranscription,
  transcriptionForUser,
} from "#lib/server/api/transcriptions.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = (event) =>
  apiEndpoint(event, (user) =>
    json(
      transcriptionForUser(
        user.id,
        event.params.projectId,
        event.params.transcriptionId,
      ),
    ),
  );

export const DELETE: RequestHandler = (event) =>
  apiEndpoint(event, (user) =>
    json(
      cancelTranscription(
        user.id,
        event.params.projectId,
        event.params.transcriptionId,
      ),
      202,
    ),
  );
