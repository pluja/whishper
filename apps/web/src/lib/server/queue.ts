import { createHash, randomBytes } from "node:crypto";

import type {
  AdapterManifest,
  JobCompletion,
  TranscriptArtifact,
  WorkerJobPayload,
  WorkerLease,
  WorkerManifest,
} from "@anysub/contracts";
import type { PoolClient } from "pg";

import { pool } from "$lib/server/db";

const LEASE_SECONDS = 60;

interface LeasableJob {
  id: string;
  attempts: number;
  payload: WorkerJobPayload;
}

export async function leaseJob(
  manifest: WorkerManifest,
): Promise<WorkerLease | null> {
  const adapterIds = manifest.adapters.map((adapter) => adapter.id);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await upsertWorker(client, manifest);
    await reclaimExpiredLeases(client);

    if (adapterIds.length === 0) {
      await client.query("commit");
      return null;
    }

    const selected = await client.query<LeasableJob>(
      `select id, attempts, payload
         from jobs
        where state = 'queued'
          and available_at <= now()
          and payload->>'adapterId' = any($1::text[])
        order by priority desc, created_at asc
        for update skip locked
        limit 1`,
      [adapterIds],
    );

    const job = selected.rows[0];
    if (!job) {
      await client.query("commit");
      return null;
    }

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
    }

    await client.query("commit");
    return {
      jobId: job.id,
      attempt: job.attempts + 1,
      leaseToken,
      leaseExpiresAt: leased.rows[0].lease_expires_at.toISOString(),
      payload: job.payload,
    };
  } catch (cause) {
    await client.query("rollback");
    throw cause;
  } finally {
    client.release();
  }
}

export async function reportProgress(
  jobId: string,
  leaseToken: string,
  progress: number,
  message: string,
): Promise<boolean> {
  const result = await pool.query(
    `update jobs
        set progress = $3,
            progress_message = $4,
            lease_expires_at = now() + make_interval(secs => $5),
            updated_at = now()
      where id = $1
        and state = 'leased'
        and lease_token_hash = $2
        and lease_expires_at > now()`,
    [jobId, hashToken(leaseToken), progress, message, LEASE_SECONDS],
  );
  return result.rowCount === 1;
}

export async function completeJob(
  jobId: string,
  leaseToken: string,
  completion: JobCompletion,
): Promise<"completed" | "already-completed" | "lease-rejected"> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const locked = await client.query<{
      state: string;
      run_id: string | null;
      payload: WorkerJobPayload;
    }>("select state, run_id, payload from jobs where id = $1 for update", [
      jobId,
    ]);
    const job = locked.rows[0];
    if (!job) return await rollback(client, "lease-rejected");
    if (job.state === "completed")
      return await rollback(client, "already-completed");

    const accepted = await client.query(
      `select 1 from jobs
        where id = $1 and state = 'leased'
          and lease_token_hash = $2 and lease_expires_at > now()`,
      [jobId, hashToken(leaseToken)],
    );
    if (accepted.rowCount !== 1)
      return await rollback(client, "lease-rejected");

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
    await client.query("commit");
    return "completed";
  } catch (cause) {
    await client.query("rollback");
    throw cause;
  } finally {
    client.release();
  }
}

export async function failJob(
  jobId: string,
  leaseToken: string,
  failure: { code: string; message: string; retryable: boolean },
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const updated = await client.query<{
      run_id: string | null;
      state: string;
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
        returning run_id, state`,
      [
        jobId,
        hashToken(leaseToken),
        failure.retryable,
        JSON.stringify(failure),
        failure.message,
      ],
    );
    const job = updated.rows[0];
    if (!job) return await rollback(client, false);
    if (job.state === "failed" && job.run_id) {
      await client.query(
        `update transcription_runs set status = 'failed' where id = $1`,
        [job.run_id],
      );
    }
    await client.query("commit");
    return true;
  } catch (cause) {
    await client.query("rollback");
    throw cause;
  } finally {
    client.release();
  }
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

async function reclaimExpiredLeases(client: PoolClient): Promise<void> {
  await client.query(
    `update jobs
        set state = case when attempts < max_attempts then 'queued' else 'failed' end,
            available_at = now(),
            leased_by = null,
            lease_token_hash = null,
            lease_expires_at = null,
            progress_message = 'Worker lease expired',
            updated_at = now()
      where state = 'leased' and lease_expires_at <= now()`,
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

async function rollback<T>(client: PoolClient, result: T): Promise<T> {
  await client.query("rollback");
  return result;
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
  for (const adapter of value.adapters) validateManifestAdapter(adapter);
  return value as unknown as WorkerManifest;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
