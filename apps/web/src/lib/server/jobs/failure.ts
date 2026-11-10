import type { JobFailure, WorkerJobPayload } from "@anysub/contracts";
import { and, eq, lte } from "drizzle-orm";

import type { Executor } from "$lib/server/db";
import {
  jobs,
  projects,
  transcriptionRuns,
  type StoredJobError,
} from "$lib/server/db/schema";
import { withTransaction } from "$lib/server/db/transaction";
import { holdsActiveLease } from "$lib/server/jobs/predicates";
import { cleanupStagedMediaAttempt } from "$lib/server/media/artifact-staging";

const RETRY_DELAY_MS = 5_000;

// A worker that vanishes without reporting was usually killed for running out
// of memory, so the message points at the settings that use less of it.
const LEASE_EXPIRED_FAILURE: StoredJobError = {
  code: "lease_expired",
  message:
    "The worker stopped before finishing, often because it ran out of memory. Try a smaller model or a lower batch size.",
  retryable: false,
};
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
        leasedBy: null,
        leaseTokenHash: null,
        leaseExpiresAt: null,
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
    tx.update(jobs)
      .set({
        state: retry ? "queued" : "failed",
        availableAt: now,
        leasedBy: null,
        leaseTokenHash: null,
        leaseExpiresAt: null,
        progressMessage: retry
          ? LEASE_EXPIRED_RETRY_MESSAGE
          : LEASE_EXPIRED_FAILURE.message,
        ...(!retry && { error: LEASE_EXPIRED_FAILURE }),
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
