import { createHash, randomBytes } from "node:crypto";

import type {
  AdapterManifest,
  JobCompletion,
  TranscriptArtifact,
  TranscriptionJobCompletion,
  WorkerJobPayload,
  WorkerLease,
  WorkerManifest,
  WorkerHardware,
} from "@anysub/contracts";
import type { PoolClient } from "pg";
import type { MediaFinalizationPlan } from "$lib/server/media-preparation";

import { pool } from "$lib/server/db";
import { withTransaction } from "$lib/server/db/transaction";
import {
  commitMediaFinalization,
  cleanupStagedMediaArtifacts,
  cleanupStagedMediaAttempt,
  finalizeMediaPreparation,
  rollbackMediaFinalization,
} from "$lib/server/media-preparation";

const LEASE_SECONDS = 60;

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
    manifest.capabilities.mediaPreparation === "1.0";
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
            (payload->>'kind' = 'transcribe' and payload->>'adapterId' = any($1::text[]))
            or (payload->>'kind' = 'media_prepare' and $2)
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
      }>(
        `select state, run_id, workspace_id, attempts, payload
         from jobs where id = $1 for update`,
        [jobId],
      );
      const job = locked.rows[0];
      if (!job) return "lease-rejected";
      if (job.state === "completed") return "already-completed";

      const accepted = await client.query(
        `select 1 from jobs
        where id = $1 and state = 'leased'
          and lease_token_hash = $2 and lease_expires_at > now()`,
        [jobId, hashToken(leaseToken)],
      );
      if (accepted.rowCount !== 1) return "lease-rejected";

      if (job.payload.kind === "transcribe") {
        if (completion.kind !== "transcribe") {
          throw new Error("Worker completion does not match the leased job.");
        }
        await storeTranscriptCompletion(
          client,
          { run_id: job.run_id, payload: job.payload },
          completion,
        );
      } else {
        if (completion.kind !== "media_prepare") {
          throw new Error("Worker completion does not match the leased job.");
        }
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
      await commitMediaFinalization(mediaFinalization).catch(() => undefined);
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
  const artifact = validateArtifact(completion.artifact);
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

  for (const [position, cue] of artifact.cues.entries()) {
    await client.query(
      `insert into cues (track_id, position, start_us, end_us, text, words)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        track.rows[0].id,
        position,
        cue.startUs,
        cue.endUs,
        cue.text,
        JSON.stringify(cue.words),
      ],
    );
  }
}

export async function failJob(
  jobId: string,
  leaseToken: string,
  failure: { code: string; message: string; retryable: boolean },
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
              lease_token_hash = null,
              lease_expires_at = null,
              updated_at = now()
        where id = $1 and state = 'leased' and lease_token_hash = $2
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
    if (job.state === "failed" && job.run_id) {
      await client.query(
        `update transcription_runs set status = 'failed' where id = $1`,
        [job.run_id],
      );
    }
    if (job.payload.kind === "media_prepare") {
      await client.query(
        `update projects
            set media_preparation_status = $2, updated_at = now()
          where id = $1`,
        [job.payload.projectId, job.state === "failed" ? "failed" : "queued"],
      );
    }
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
            updated_at = now()
      where state = 'leased' and lease_expires_at <= now()
      returning id, state, attempts, payload`,
  );
  const mediaJobs = reclaimed.rows.filter(
    (job) => job.payload.kind === "media_prepare",
  );
  for (const job of mediaJobs) {
    await client.query(
      `update projects
          set media_preparation_status = $2, updated_at = now()
        where id = $1`,
      [job.payload.projectId, job.state === "failed" ? "failed" : "queued"],
    );
  }
  return mediaJobs.map((job) => ({
    jobId: job.id,
    attempt: job.attempts,
  }));
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

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function validateArtifact(artifact: TranscriptArtifact): TranscriptArtifact {
  if (
    artifact.schemaVersion !== "1.0" ||
    artifact.durationUs < 0 ||
    !artifact.language
  ) {
    throw new Error("Adapter returned an unsupported transcript artifact");
  }
  let previousStart = -1;
  for (const cue of artifact.cues) {
    if (
      cue.startUs < 0 ||
      cue.endUs < cue.startUs ||
      cue.endUs > artifact.durationUs
    ) {
      throw new Error("Adapter returned invalid cue timing");
    }
    if (cue.startUs < previousStart)
      throw new Error("Adapter cues are not ordered");
    previousStart = cue.startUs;
  }
  return artifact;
}

export function parseWorkerManifest(value: unknown): WorkerManifest {
  if (!isRecord(value)) throw new Error("Worker manifest must be an object");
  if (value.protocolVersion !== "1.0")
    throw new Error("Unsupported worker protocol");
  if (
    typeof value.workerId !== "string" ||
    typeof value.name !== "string" ||
    typeof value.version !== "string" ||
    typeof value.architecture !== "string" ||
    !Array.isArray(value.adapters)
  ) {
    throw new Error("Worker manifest is incomplete");
  }
  const capabilities = isRecord(value.capabilities) ? value.capabilities : {};
  if (
    capabilities.mediaPreparation !== undefined &&
    capabilities.mediaPreparation !== "1.0"
  ) {
    throw new Error("Unsupported media preparation capability");
  }
  for (const adapter of value.adapters) validateManifestAdapter(adapter);
  const hardware =
    value.hardware === undefined
      ? undefined
      : parseWorkerHardware(value.hardware);
  return {
    ...(value as unknown as Omit<WorkerManifest, "capabilities" | "hardware">),
    capabilities: {
      ...(capabilities.mediaPreparation === "1.0"
        ? { mediaPreparation: "1.0" as const }
        : {}),
    },
    ...(hardware ? { hardware } : {}),
  };
}

function validateManifestAdapter(
  value: unknown,
): asserts value is AdapterManifest {
  if (!isRecord(value) || value.protocolVersion !== "1.0") {
    throw new Error("Unsupported adapter protocol");
  }
  if (typeof value.id !== "string" || !Array.isArray(value.models)) {
    throw new Error("Adapter manifest is incomplete");
  }
}

function parseWorkerHardware(value: unknown): WorkerHardware {
  if (
    !isRecord(value) ||
    (value.device !== "cpu" && value.device !== "cuda") ||
    typeof value.computeType !== "string" ||
    !isRecord(value.cpu) ||
    (value.cpu.model !== undefined && typeof value.cpu.model !== "string") ||
    !isPositiveInteger(value.cpu.logicalCores) ||
    !isRecord(value.memory) ||
    !isPositiveInteger(value.memory.totalBytes) ||
    !isNonNegativeInteger(value.memory.availableBytes) ||
    value.memory.availableBytes > value.memory.totalBytes ||
    !Array.isArray(value.gpus) ||
    !value.gpus.every(
      (gpu) =>
        isRecord(gpu) &&
        typeof gpu.name === "string" &&
        (gpu.backend === "cuda" || gpu.backend === "rocm") &&
        isPositiveInteger(gpu.totalMemoryBytes),
    )
  ) {
    throw new Error("Worker hardware inventory is invalid");
  }
  return value as unknown as WorkerHardware;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
