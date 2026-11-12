import type { TranscriptionJobPayload } from "@anysub/contracts";

import { jobs, transcriptionRuns } from "#lib/server/db/schema.ts";
import { withTransaction } from "#lib/server/db/transaction.ts";
import { badRequest, conflict, notFound } from "#lib/server/http/errors.ts";
import { projectForUser } from "#lib/server/projects/access.ts";
import { readInstanceSettings } from "#lib/server/settings/instance.ts";
import { resolveDataPath } from "#lib/server/storage/paths.ts";
import { hasActiveTranscriptionRun } from "#lib/server/transcription/active-run.ts";
import {
  acceptsOption,
  availableTranscriptionModels,
} from "#lib/server/transcription/models.ts";
import { activeWorkerManifests } from "#lib/server/workers/presence.ts";
import {
  MAX_LINE_LENGTH,
  MIN_LINE_LENGTH,
  type Precision,
} from "#lib/shared/instance-settings.ts";
import { DETECT_LANGUAGE, LANGUAGE_TAG } from "#lib/shared/languages.ts";
import { DEFAULT_MAX_LINE_LENGTH, MAX_BATCH_SIZE } from "#lib/shared/limits.ts";
import { parseModelKey } from "#lib/shared/transcription-models.ts";

type TranscriptionOptions = {
  alignment: boolean;
  maxLineLength: number;
  batchSize?: number;
  precision?: Precision;
};

export type TranscriptionRequest = {
  adapterId: string;
  modelId: string;
  language: string | null;
  options: TranscriptionOptions;
};

export function parseTranscriptionRequest(
  values: FormData,
): TranscriptionRequest {
  const model = parseModelKey(String(values.get("model") ?? ""));
  const language = String(values.get("language") ?? DETECT_LANGUAGE).trim();
  const batchSizeValue = String(values.get("batchSize") ?? "").trim();
  const maxLineLength = Number(
    String(values.get("maxLineLength") ?? DEFAULT_MAX_LINE_LENGTH).trim(),
  );

  if (!model) {
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
    ...model,
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

    const { precision } = readInstanceSettings(tx);
    const model = availableTranscriptionModels(
      activeWorkerManifests(tx),
      precision,
    ).find(
      (candidate) =>
        candidate.adapterId === request.adapterId &&
        candidate.modelId === request.modelId,
    );
    if (!model) {
      throw conflict("That model is not available on a connected worker.");
    }
    // Precision is the administrator's choice, so it applies to every run of
    // an adapter that offers it.
    const options: TranscriptionOptions = acceptsOption(
      model.optionsSchema,
      "precision",
    )
      ? { ...request.options, precision }
      : request.options;

    const run = tx
      .insert(transcriptionRuns)
      .values({
        projectId: project.id,
        adapterId: request.adapterId,
        modelId: request.modelId,
        options,
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
      options,
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
