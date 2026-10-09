import { randomBytes } from "node:crypto";

import {
  MEDIA_PREPARATION_VERSION,
  parseProtocolMessage,
  validateWorkerManifest,
  type JobCompletion,
  type JobFailure,
  type TranscriptArtifact,
  type TranscriptionJobCompletion,
  type WorkerJobPayload,
  type WorkerLease,
  type WorkerManifest,
} from "@anysub/contracts";
import type { PoolClient } from "pg";
import type { MediaFinalizationPlan } from "$lib/server/media-finalize";

import { pool } from "$lib/server/db";
import { insertCues } from "$lib/server/cues";
import { unprocessable } from "$lib/server/http-error";
import { withTransaction } from "$lib/server/db/transaction";
import { hashToken } from "$lib/server/util";
import { cleanupStagedMediaAttempt } from "$lib/server/media-artifact-staging";
import {
  commitMediaFinalization,
  finalizeMediaPreparation,
  rollbackMediaFinalization,
} from "$lib/server/media-finalize";

const LEASE_SECONDS = 60;

const LEASE_EXPIRED_FAILURE: JobFailure = {
  code: "lease_expired",
  message: "Worker lease expired",
  retryable: false,
};

type LeasableJob = {
  id: string;
  attempts: number;
  payload: WorkerJobPayload;
};

type ReclaimedMediaAttempt = {
  jobId: string;
  attempt: number;
};

export async function leaseJob(
  manifest: WorkerManifest,
): Promise<WorkerLease | null> {
  const adapterIds = manifest.adapters.map((adapter) => adapter.id);
  const supportsMediaPreparation =
    manifest.capabilities.mediaPreparation === MEDIA_PREPARATION_VERSION;
  const { lease, reclaimedArtifactJobs } = await withTransaction(
    async (client) => {
      await upsertWorker(client, manifest);
      const reclaimedArtifactJobs = await reclaimExpiredLeases(client);

      if (adapterIds.length === 0 && !supportsMediaPreparation) {
        return { lease: null, reclaimedArtifactJobs };
      }

      const selected = await client.query<LeasableJob>(
        `select id, attempts, payload
         from jobs
        where state = 'queued'
          and available_at <= now()
          and (
            (kind = 'transcribe' and payload->>'adapterId' = any($1::text[]))
            or (kind = 'media_prepare' and $2)
          )
        order by priority desc, created_at asc
        for update skip locked
        limit 1`,
        [adapterIds, supportsMediaPreparation],
      );

      const job = selected.rows[0];
      if (!job) return { lease: null, reclaimedArtifactJobs };

      const leaseToken = randomBytes(32).toString("base64url");
      const leaseTokenHash = hashToken(leaseToken);
      const leased = await client.query<{ lease_expires_at: Date }>(
        `update jobs
          set state = 'leased',
              leased_by = $2,
              lease_token_hash = $3,
              lease_expires_at = now() + make_interval(secs => $4),
              attempts = attempts + 1,
              updated_at = now()
        where id = $1
        returning lease_expires_at`,
        [job.id, manifest.workerId, leaseTokenHash, LEASE_SECONDS],
      );
      if (job.payload.kind === "transcribe") {
        await client.query(
          `update transcription_runs
            set status = 'running'
          where id = $1 and status = 'queued'`,
          [job.payload.runId],
        );
      } else {
        await client.query(
          `update projects
            set media_preparation_status = 'running', updated_at = now()
          where id = $1`,
          [job.payload.projectId],
        );
      }

      return {
        lease: {
          jobId: job.id,
          attempt: job.attempts + 1,
          leaseToken,
          leaseExpiresAt: leased.rows[0].lease_expires_at.toISOString(),
          payload: job.payload,
        },
        reclaimedArtifactJobs,
      };
    },
  );
  await cleanupReclaimedArtifacts(reclaimedArtifactJobs);
  return lease;
}

export async function reportProgress(
  jobId: string,
  leaseToken: string,
  progress: number,
  message: string,
): Promise<boolean> {
  const result = await pool.query(
    `with heartbeat as (
       update jobs
          set progress = $3,
              progress_message = $4,
              lease_expires_at = now() + make_interval(secs => $5),
              updated_at = now()
        where id = $1
          and state = 'leased'
          and lease_token_hash = $2
          and lease_expires_at > now()
      returning leased_by
     )
     update workers
        set last_seen_at = now()
       from heartbeat
      where workers.id = heartbeat.leased_by
     returning workers.id`,
    [jobId, hashToken(leaseToken), progress, message, LEASE_SECONDS],
  );
  return result.rowCount === 1;
}

export async function completeJob(
  jobId: string,
  leaseToken: string,
  completion: JobCompletion,
): Promise<"completed" | "already-completed" | "lease-rejected"> {
  let mediaFinalization: MediaFinalizationPlan | undefined;
  try {
    const outcome = await withTransaction(async (client) => {
      const locked = await client.query<{
        state: string;
        run_id: string | null;
        workspace_id: string;
        attempts: number;
        payload: WorkerJobPayload;
        lease_accepted: boolean;
      }>(
        `select state, run_id, workspace_id, attempts, payload,
                (state = 'leased' and lease_token_hash = $2
                 and lease_expires_at > now()) as lease_accepted
         from jobs where id = $1 for update`,
        [jobId, hashToken(leaseToken)],
      );
      const job = locked.rows[0];
      if (!job) return "lease-rejected";
      if (job.state === "completed") return "already-completed";
      if (!job.lease_accepted) return "lease-rejected";

      if (job.payload.kind === "transcribe") {
        if (completion.kind !== "transcribe") throw completionKindMismatch();
        await storeTranscriptCompletion(
          client,
          { run_id: job.run_id, payload: job.payload },
          completion,
        );
      } else {
        if (completion.kind !== "media_prepare") throw completionKindMismatch();
        mediaFinalization = await finalizeMediaPreparation(client, {
          jobId,
          attempt: job.attempts,
          workspaceId: job.workspace_id,
          payload: job.payload,
          completion,
        });
      }

      await client.query(
        `update jobs
          set state = 'completed', result = $2, progress = 1,
              progress_message = 'Completed', completed_at = now(), updated_at = now(),
              lease_token_hash = null, lease_expires_at = null
        where id = $1`,
        [jobId, JSON.stringify(completion)],
      );
      if (job.run_id) {
        await client.query(
          `update transcription_runs set status = 'completed', completed_at = now() where id = $1`,
          [job.run_id],
        );
      }
      return "completed";
    });
    if (outcome === "completed" && mediaFinalization) {
      await commitMediaFinalization(mediaFinalization).catch((cause) => {
        console.warn(`Could not finalize media for job ${jobId}`, cause);
      });
    }
    return outcome;
  } catch (cause) {
    if (mediaFinalization) await rollbackMediaFinalization(mediaFinalization);
    throw cause;
  }
}

async function storeTranscriptCompletion(
  client: PoolClient,
  job: {
    run_id: string | null;
    payload: Extract<WorkerJobPayload, { kind: "transcribe" }>;
  },
  completion: TranscriptionJobCompletion,
): Promise<void> {
  const { artifact } = completion;
  assertTranscriptTiming(artifact);
  const track = await client.query<{ id: string }>(
    `insert into subtitle_tracks
      (project_id, source_run_id, name, language, kind, metadata)
     values ($1, $2, $3, $4, 'transcription', $5)
     returning id`,
    [
      job.payload.projectId,
      job.run_id,
      `${completion.adapter.id} · ${completion.adapter.modelId}`,
      artifact.language,
      JSON.stringify({
        adapter: completion.adapter,
        schemaVersion: artifact.schemaVersion,
        durationUs: artifact.durationUs,
        ...artifact.metadata,
      }),
    ],
  );

  await insertCues(client, track.rows[0].id, {
    ids: "generate",
    cues: artifact.cues,
  });
}

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

async function upsertWorker(
  client: PoolClient,
  manifest: WorkerManifest,
): Promise<void> {
  await client.query(
    `insert into workers (id, name, version, architecture, protocol_version, manifest, last_seen_at)
     values ($1, $2, $3, $4, $5, $6, now())
     on conflict (id) do update set
       name = excluded.name,
       version = excluded.version,
       architecture = excluded.architecture,
       protocol_version = excluded.protocol_version,
       manifest = excluded.manifest,
       last_seen_at = now()`,
    [
      manifest.workerId,
      manifest.name,
      manifest.version,
      manifest.architecture,
      manifest.protocolVersion,
      JSON.stringify(manifest),
    ],
  );
}

async function reclaimExpiredLeases(
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

async function cleanupReclaimedArtifacts(
  attempts: ReclaimedMediaAttempt[],
): Promise<void> {
  await Promise.all(
    attempts.map(({ jobId, attempt }) =>
      cleanupStagedMediaAttempt(jobId, attempt),
    ),
  );
}

function completionKindMismatch(): Error {
  return unprocessable("Worker completion does not match the leased job.");
}

function assertTranscriptTiming(artifact: TranscriptArtifact): void {
  let previousStart = -1;
  for (const cue of artifact.cues) {
    if (cue.endUs < cue.startUs || cue.endUs > artifact.durationUs) {
      throw unprocessable("Adapter returned invalid cue timing.");
    }
    if (cue.startUs < previousStart) {
      throw unprocessable("Adapter cues are not ordered.");
    }
    previousStart = cue.startUs;
  }
}

export function parseWorkerManifest(value: unknown): WorkerManifest {
  const parsed = parseProtocolMessage(validateWorkerManifest, value);
  if (!parsed.ok) {
    throw new Error(`Invalid worker manifest: ${parsed.errors.join("; ")}`);
  }
  const memory = parsed.value.hardware?.memory;
  if (memory && memory.availableBytes > memory.totalBytes) {
    throw new Error("Worker hardware inventory is invalid");
  }
  return parsed.value;
}
