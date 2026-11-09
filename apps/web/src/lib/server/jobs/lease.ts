import {
  MEDIA_PREPARATION_VERSION,
  type WorkerJobPayload,
  type WorkerLease,
  type WorkerManifest,
} from "@anysub/contracts";
import { pool } from "$lib/server/db";
import { withTransaction } from "$lib/server/db/transaction";
import {
  cleanupReclaimedArtifacts,
  reclaimExpiredLeases,
} from "$lib/server/jobs/failure";
import { generateLeaseToken, hashToken } from "$lib/server/jobs/lease-token";
import { IS_MEDIA_PREPARE_JOB } from "$lib/server/jobs/predicates";
import { recordWorkerPresence } from "$lib/server/workers/presence";

const LEASE_SECONDS = 60;
export const WORKER_POLL_INTERVAL_MS = 2_000;

type LeasableJob = {
  id: string;
  attempts: number;
  payload: WorkerJobPayload;
};

export async function leaseJob(
  manifest: WorkerManifest,
): Promise<WorkerLease | null> {
  const adapterIds = manifest.adapters.map((adapter) => adapter.id);
  const supportsMediaPreparation =
    manifest.capabilities.mediaPreparation === MEDIA_PREPARATION_VERSION;
  const { lease, reclaimedArtifactJobs } = await withTransaction(
    async (client) => {
      await recordWorkerPresence(client, manifest);
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
            or (${IS_MEDIA_PREPARE_JOB} and $2)
          )
        order by priority desc, created_at asc
        for update skip locked
        limit 1`,
        [adapterIds, supportsMediaPreparation],
      );

      const job = selected.rows[0];
      if (!job) return { lease: null, reclaimedArtifactJobs };

      const leaseToken = generateLeaseToken();
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
