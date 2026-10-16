import type { JobFailure, WorkerJobPayload } from "@anysub/contracts";
import type { PoolClient } from "pg";

import { withTransaction } from "$lib/server/db/transaction";
import { hashToken } from "$lib/server/jobs/lease-token";
import { cleanupStagedMediaAttempt } from "$lib/server/media/artifact-staging";

const LEASE_EXPIRED_FAILURE: JobFailure = {
  code: "lease_expired",
  message: "Worker lease expired",
  retryable: false,
};

type ReclaimedMediaAttempt = {
  jobId: string;
  attempt: number;
};

export async function failJob(
  jobId: string,
  leaseToken: string,
  failure: JobFailure,
): Promise<boolean> {
  const job = await withTransaction(async (client) => {
    const updated = await client.query<{
      run_id: string | null;
      state: string;
      attempts: number;
      payload: WorkerJobPayload;
    }>(
      `update jobs
          set state = case when $3 and attempts < max_attempts then 'queued' else 'failed' end,
              available_at = case when $3 then now() + interval '5 seconds' else available_at end,
              error = $4,
              progress_message = $5,
              leased_by = null,
              lease_token_hash = null,
              lease_expires_at = null,
              updated_at = now()
        where id = $1
          and state = 'leased'
          and lease_token_hash = $2
          and lease_expires_at > now()
        returning run_id, state, attempts, payload`,
      [
        jobId,
        hashToken(leaseToken),
        failure.retryable,
        JSON.stringify(failure),
        failure.message,
      ],
    );
    const job = updated.rows[0];
    if (!job) return null;
    await syncJobSubject(client, job);
    return job;
  });
  if (!job) return false;
  if (job.payload.kind === "media_prepare") {
    await cleanupStagedMediaAttempt(jobId, job.attempts);
  }
  return true;
}

export async function reclaimExpiredLeases(
  client: PoolClient,
): Promise<ReclaimedMediaAttempt[]> {
  const reclaimed = await client.query<{
    id: string;
    run_id: string | null;
    state: string;
    attempts: number;
    payload: WorkerJobPayload;
  }>(
    `update jobs
        set state = case when attempts < max_attempts then 'queued' else 'failed' end,
            available_at = now(),
            leased_by = null,
            lease_token_hash = null,
            lease_expires_at = null,
            progress_message = 'Worker lease expired',
            error = case
              when attempts < max_attempts then error
              else $1::jsonb
            end,
            updated_at = now()
      where state = 'leased' and lease_expires_at <= now()
      returning id, run_id, state, attempts, payload`,
    [JSON.stringify(LEASE_EXPIRED_FAILURE)],
  );
  for (const job of reclaimed.rows) await syncJobSubject(client, job);
  const mediaJobs = reclaimed.rows.filter(
    (job) => job.payload.kind === "media_prepare",
  );
  return mediaJobs.map((job) => ({
    jobId: job.id,
    attempt: job.attempts,
  }));
}

async function syncJobSubject(
  client: PoolClient,
  job: { run_id: string | null; state: string; payload: WorkerJobPayload },
): Promise<void> {
  const failed = job.state === "failed";
  if (job.run_id) {
    await client.query(
      `update transcription_runs set status = $2 where id = $1`,
      [job.run_id, failed ? "failed" : "queued"],
    );
  }
  if (job.payload.kind === "media_prepare") {
    await client.query(
      `update projects
          set media_preparation_status = $2, updated_at = now()
        where id = $1`,
      [job.payload.projectId, failed ? "failed" : "queued"],
    );
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
