import { and, eq } from "drizzle-orm";

import {
  TRANSCRIPTION_OPTIONS,
  type ApiTranscription,
  type ApiTranscriptionRequest,
} from "#lib/server/api/schemas.ts";
import { db, type Executor } from "#lib/server/db/index.ts";
import { subtitleTracks, transcriptionRuns } from "#lib/server/db/schema.ts";
import { badRequest, conflict, notFound } from "#lib/server/http/errors.ts";
import { requireMemberProject } from "#lib/server/projects/access.ts";
import { latestRunJob, NEWEST_FIRST } from "#lib/server/projects/studio.ts";
import { readTranscriptionDefaults } from "#lib/server/settings/instance.ts";
import { cancelTranscriptionForUser } from "#lib/server/transcription/cancel.ts";
import { enqueueTranscription } from "#lib/server/transcription/enqueue.ts";
import { transcriptionModelChoices } from "#lib/server/transcription/models.ts";
import { activeWorkerManifests } from "#lib/server/workers/presence.ts";
import { microsToDollars } from "#lib/shared/money.ts";
import { ACTIVE_RUN_STATUSES } from "#lib/shared/project-status.ts";
import {
  acceptsOption,
  modelKey,
  parseModelKey,
} from "#lib/shared/transcription-models.ts";

// Starts a run the way the transcribe form does. Options the chosen model
// does not take are refused instead of ignored, so a script learns at once.
export function startTranscription(
  userId: string,
  projectId: string,
  input: ApiTranscriptionRequest,
): ApiTranscription {
  const key = parseModelKey(input.model);
  const defaults = readTranscriptionDefaults(db);
  const model = transcriptionModelChoices(
    db,
    activeWorkerManifests(db),
    defaults.precision,
  ).find((candidate) => candidate.key === input.model);
  if (!key || !model) {
    throw badRequest(
      "model: No connected worker offers that model. List them with GET /api/v1/models.",
    );
  }
  for (const option of TRANSCRIPTION_OPTIONS) {
    if (
      input[option] !== undefined &&
      !acceptsOption(model.optionsSchema, option)
    ) {
      throw badRequest(
        `${option}: ${model.displayName} does not take this option.`,
      );
    }
  }
  const runId = enqueueTranscription(projectId, userId, {
    ...key,
    language: input.language === undefined ? defaults.language : input.language,
    options: {
      alignment: input.alignment ?? defaults.alignment,
      maxLineLength: input.maxLineLength ?? defaults.maxLineLength,
      ...(input.batchSize === undefined ? {} : { batchSize: input.batchSize }),
    },
  });
  return requireTranscription(db, projectId, runId);
}

export function transcriptionForUser(
  userId: string,
  projectId: string,
  runId: string,
): ApiTranscription {
  requireMemberProject(db, projectId, userId);
  return requireTranscription(db, projectId, runId);
}

export function cancelTranscription(
  userId: string,
  projectId: string,
  runId: string,
): ApiTranscription {
  const run = transcriptionForUser(userId, projectId, runId);
  if (!(ACTIVE_RUN_STATUSES as string[]).includes(run.status)) {
    throw conflict("This transcription has already finished.");
  }
  if (!cancelTranscriptionForUser(projectId, userId)) {
    throw conflict("This transcription has already finished.");
  }
  return requireTranscription(db, projectId, runId);
}

export function latestTranscription(
  executor: Executor,
  projectId: string,
): ApiTranscription | null {
  const latest = executor
    .select({ id: transcriptionRuns.id })
    .from(transcriptionRuns)
    .where(eq(transcriptionRuns.projectId, projectId))
    .orderBy(...NEWEST_FIRST)
    .limit(1)
    .get();
  return latest ? transcriptionView(executor, projectId, latest.id) : null;
}

function requireTranscription(
  executor: Executor,
  projectId: string,
  runId: string,
): ApiTranscription {
  const run = transcriptionView(executor, projectId, runId);
  if (!run) throw notFound("Transcription not found.");
  return run;
}

function transcriptionView(
  executor: Executor,
  projectId: string,
  runId: string,
): ApiTranscription | null {
  const run = executor
    .select()
    .from(transcriptionRuns)
    .where(
      and(
        eq(transcriptionRuns.id, runId),
        eq(transcriptionRuns.projectId, projectId),
      ),
    )
    .get();
  if (!run) return null;
  const job = latestRunJob(executor, run.id);
  const track = executor
    .select({ id: subtitleTracks.id })
    .from(subtitleTracks)
    .where(eq(subtitleTracks.sourceRunId, run.id))
    .get();
  return {
    id: run.id,
    projectId: run.projectId,
    status: run.status,
    model: modelKey(run.adapterId, run.modelId),
    progress: job?.progress ?? null,
    message: job?.progressMessage ?? null,
    error:
      run.status === "failed" && job?.error
        ? { code: job.error.code, message: job.error.message }
        : null,
    trackId: track?.id ?? null,
    estimatedCostUsd:
      run.estimatedCostMicros === null
        ? null
        : microsToDollars(run.estimatedCostMicros),
    createdAt: run.createdAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
  };
}
