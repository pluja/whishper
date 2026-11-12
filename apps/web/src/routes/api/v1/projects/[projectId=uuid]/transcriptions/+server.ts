import { apiEndpoint, json, readJsonBody } from "#lib/server/api/handler.ts";
import { TranscriptionRequestSchema } from "#lib/server/api/schemas.ts";
import { startTranscription } from "#lib/server/api/transcriptions.ts";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = (event) =>
  apiEndpoint(event, async (user) =>
    json(
      startTranscription(
        user.id,
        event.params.projectId,
        await readJsonBody(event.request, TranscriptionRequestSchema),
      ),
      202,
    ),
  );
