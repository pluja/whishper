import type { JobFailure, WorkerJobPayload } from "@anysub/contracts";
import { and, eq, lte } from "drizzle-orm";

import type { Executor } from "#lib/server/db/index.ts";
import {
  jobs,
  projects,
  transcriptionRuns,
  type StoredJobError,
} from "#lib/server/db/schema.ts";
import { withTransaction } from "#lib/server/db/transaction.ts";
import { holdsActiveLease } from "#lib/server/jobs/predicates.ts";
import { RELEASED_LEASE } from "#lib/server/jobs/release.ts";
import { cleanupStagedMediaAttempt } from "#lib/server/media/artifact-staging.ts";
import { REMOTE_ADAPTER_ID } from "#lib/shared/transcription-models.ts";

const RETRY_DELAY_MS = 5_000;

const LEASE_EXPIRED_RETRY_MESSAGE =
  "The worker stopped before finishing. Trying again.";

type ReclaimedMediaAttempt = {
  jobId: string;
  attempt: number;
};

type JobSubject = {
  runId: string | null;
  state: "queued" | "failed";
  payload: WorkerJobPayload;
};

export async function failJob(
  jobId: string,
  leaseToken: string,
  failure: JobFailure,
): Promise<boolean> {
  const failed = withTransaction((tx) => {
    const now = new Date();
    const job = tx
      .select({
        runId: jobs.runId,
        attempts: jobs.attempts,
        maxAttempts: jobs.maxAttempts,
        payload: jobs.payload,
      })
      .from(jobs)
      .where(and(eq(jobs.id, jobId), holdsActiveLease(leaseToken, now)))
      .get();
    if (!job) return null;

    const state =
      failure.retryable && job.attempts < job.maxAttempts ? "queued" : "failed";
    tx.update(jobs)
      .set({
        state,
        ...(failure.retryable && {
          availableAt: new Date(now.getTime() + RETRY_DELAY_MS),
        }),
        error: failure,
        progressMessage: failure.message,
        ...RELEASED_LEASE,
      })
      .where(eq(jobs.id, jobId))
      .run();
    syncJobSubject(tx, { runId: job.runId, state, payload: job.payload });
    return job;
  });
  if (!failed) return false;
  if (failed.payload.kind === "media_prepare") {
    await cleanupStagedMediaAttempt(jobId, failed.attempts);
  }
  return true;
}

// For a queued job the application itself cannot hand out, such as one whose
// remote model was removed.
export function failUnleasableJob(
  tx: Executor,
  jobId: string,
  payload: WorkerJobPayload,
  failure: StoredJobError,
): void {
  const job = tx
    .update(jobs)
    .set({ state: "failed", error: failure, progressMessage: failure.message })
    .where(and(eq(jobs.id, jobId), eq(jobs.state, "queued")))
    .returning({ runId: jobs.runId })
    .get();
  if (job) syncJobSubject(tx, { runId: job.runId, state: "failed", payload });
}

export function reclaimExpiredLeases(tx: Executor): ReclaimedMediaAttempt[] {
  const now = new Date();
  const expired = tx
    .select({
      id: jobs.id,
      runId: jobs.runId,
      attempts: jobs.attempts,
      maxAttempts: jobs.maxAttempts,
      payload: jobs.payload,
    })
    .from(jobs)
    .where(and(eq(jobs.state, "leased"), lte(jobs.leaseExpiresAt, now)))
    .all();

  for (const job of expired) {
    const retry = job.attempts < job.maxAttempts;
    const failure = leaseExpiredFailure(job.payload);
    tx.update(jobs)
      .set({
        state: retry ? "queued" : "failed",
        availableAt: now,
        ...RELEASED_LEASE,
        progressMessage: retry ? LEASE_EXPIRED_RETRY_MESSAGE : failure.message,
        ...(!retry && { error: failure }),
      })
      .where(eq(jobs.id, job.id))
      .run();
    syncJobSubject(tx, {
      runId: job.runId,
      state: retry ? "queued" : "failed",
      payload: job.payload,
    });
  }

  return expired
    .filter((job) => job.payload.kind === "media_prepare")
    .map((job) => ({ jobId: job.id, attempt: job.attempts }));
}

// A worker that vanishes during a transcription was usually killed for running
// out of memory, so that message points at the settings that use less of it.
function leaseExpiredFailure(payload: WorkerJobPayload): StoredJobError {
  const localTranscription =
    payload.kind === "transcribe" && payload.adapterId !== REMOTE_ADAPTER_ID;
  return {
    code: "lease_expired",
    message: localTranscription
      ? "The worker stopped before finishing, often because it ran out of memory. Try a smaller model or a lower batch size."
      : "The worker stopped before finishing.",
    retryable: false,
  };
}

function syncJobSubject(tx: Executor, job: JobSubject): void {
  if (job.runId) {
    tx.update(transcriptionRuns)
      .set({ status: job.state })
      .where(eq(transcriptionRuns.id, job.runId))
      .run();
  }
  if (job.payload.kind === "media_prepare") {
    tx.update(projects)
      .set({ mediaPreparationStatus: job.state })
      .where(eq(projects.id, job.payload.projectId))
      .run();
  }
}

export async function cleanupReclaimedArtifacts(
  attempts: ReclaimedMediaAttempt[],
): Promise<void> {
  await Promise.all(
    attempts.map(({ jobId, attempt }) =>
      cleanupStagedMediaAttempt(jobId, attempt),
    ),
  );
}
