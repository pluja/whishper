import type { TranscriptionJobPayload } from "@anysub/contracts";

import { jobs, transcriptionRuns } from "$lib/server/db/schema";
import { withTransaction } from "$lib/server/db/transaction";
import { badRequest, conflict, notFound } from "$lib/server/http/errors";
import { projectForUser } from "$lib/server/projects/access";
import { resolveDataPath } from "$lib/server/storage/paths";
import { hasActiveTranscriptionRun } from "$lib/server/transcription/active-run";
import { availableTranscriptionModels } from "$lib/server/transcription/models";
import { activeWorkerManifests } from "$lib/server/workers/presence";
import { DETECT_LANGUAGE, LANGUAGE_TAG } from "$lib/shared/languages";
import { DEFAULT_MAX_LINE_LENGTH } from "$lib/shared/limits";

const MAX_BATCH_SIZE = 64;
const MIN_LINE_LENGTH = 20;
const MAX_LINE_LENGTH = 120;

export type TranscriptionRequest = {
  adapterId: string;
  modelId: string;
  language: string | null;
  options: { alignment: boolean; maxLineLength: number; batchSize?: number };
};

export function parseTranscriptionRequest(
  values: FormData,
): TranscriptionRequest {
  const modelKey = String(values.get("model") ?? "");
  const language = String(values.get("language") ?? DETECT_LANGUAGE).trim();
  const batchSizeValue = String(values.get("batchSize") ?? "").trim();
  const maxLineLength = Number(
    String(values.get("maxLineLength") ?? DEFAULT_MAX_LINE_LENGTH).trim(),
  );

  const separator = modelKey.indexOf(":");
  if (separator < 0) {
    throw badRequest("Choose an available transcription model.");
  }
  if (language !== DETECT_LANGUAGE && !LANGUAGE_TAG.test(language)) {
    throw badRequest("Choose a valid transcription language.");
  }
  const batchSize = batchSizeValue ? Number(batchSizeValue) : undefined;
  if (
    batchSize !== undefined &&
    (!Number.isInteger(batchSize) ||
      batchSize < 1 ||
      batchSize > MAX_BATCH_SIZE)
  ) {
    throw badRequest(`Batch size must be between 1 and ${MAX_BATCH_SIZE}.`);
  }
  if (
    !Number.isInteger(maxLineLength) ||
    maxLineLength < MIN_LINE_LENGTH ||
    maxLineLength > MAX_LINE_LENGTH
  ) {
    throw badRequest(
      `Maximum line length must be between ${MIN_LINE_LENGTH} and ${MAX_LINE_LENGTH} characters.`,
    );
  }

  return {
    adapterId: modelKey.slice(0, separator),
    modelId: modelKey.slice(separator + 1),
    language: language === DETECT_LANGUAGE ? null : language,
    options: {
      alignment: values.get("alignment") === "on",
      maxLineLength,
      ...(batchSize === undefined ? {} : { batchSize }),
    },
  };
}

export function enqueueTranscription(
  projectId: string,
  userId: string,
  request: TranscriptionRequest,
): void {
  withTransaction((tx) => {
    const project = projectForUser(tx, projectId, userId);
    if (!project) throw notFound("Project not found.");
    if (!project.mediaOriginalKey) {
      throw conflict("The source upload is not complete yet.");
    }

    if (hasActiveTranscriptionRun(tx, project.id)) {
      throw conflict("This project is already being transcribed.");
    }

    const available = availableTranscriptionModels(activeWorkerManifests(tx));
    if (
      !available.some(
        (model) =>
          model.adapterId === request.adapterId &&
          model.modelId === request.modelId,
      )
    ) {
      throw conflict("That model is not available on a connected worker.");
    }

    const run = tx
      .insert(transcriptionRuns)
      .values({
        projectId: project.id,
        adapterId: request.adapterId,
        modelId: request.modelId,
        options: request.options,
        createdBy: userId,
      })
      .returning({ id: transcriptionRuns.id })
      .get();
    const payload: TranscriptionJobPayload = {
      kind: "transcribe",
      adapterId: request.adapterId,
      modelId: request.modelId,
      projectId: project.id,
      runId: run.id,
      mediaPath: resolveDataPath(project.mediaOriginalKey),
      ...(request.language === null ? {} : { language: request.language }),
      options: request.options,
    };
    tx.insert(jobs)
      .values({
        workspaceId: project.workspaceId,
        projectId: project.id,
        runId: run.id,
        kind: "transcribe",
        payload,
      })
      .run();
  });
}
