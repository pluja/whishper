import { randomUUID } from "node:crypto";

import type {
  JobFailure,
  TranscriptionJobCompletion,
  WorkerManifest,
} from "@anysub/contracts";
import { describe, expect, it } from "vitest";

import { pool } from "$lib/server/db";
import {
  seedLeasedTranscriptionJob,
  seedProject,
} from "$lib/server/db/testing/fixtures";
import { completeJob } from "$lib/server/jobs/completion";
import { failJob } from "$lib/server/jobs/failure";
import { leaseJob } from "$lib/server/jobs/lease";
import { isUuid } from "$lib/shared/uuid";

const ACTIVE_LEASE = { attempts: 1, maxAttempts: 3, expiresInSeconds: 60 };

function transcriptCompletion(): TranscriptionJobCompletion {
  return {
    kind: "transcribe",
    adapter: { id: "fake", version: "1.0.0", modelId: "fake-model" },
    artifact: {
      schemaVersion: "1.0",
      language: "en",
      durationUs: 5_000_000,
      metadata: {},
      cues: [
        {
          id: "cue-000001",
          startUs: 0,
          endUs: 1_000_000,
          text: "One",
          words: [],
        },
        {
          id: "cue-1",
          startUs: 1_000_000,
          endUs: 2_000_000,
          text: "Two",
          words: [
            {
              id: "word-1",
              text: "Two",
              startUs: 1_000_000,
              endUs: 2_000_000,
              confidence: 0.9,
              speaker: null,
            },
          ],
        },
      ],
    },
  };
}

async function jobRow(jobId: string) {
  const result = await pool.query<{
    state: string;
    error: unknown;
    leased_by: string | null;
  }>(`select state, error, leased_by from jobs where id = $1`, [jobId]);
  return result.rows[0];
}

async function runStatus(runId: string): Promise<string> {
  const result = await pool.query<{ status: string }>(
    `select status from transcription_runs where id = $1`,
    [runId],
  );
  return result.rows[0].status;
}

describe("completeJob", () => {
  it("stores a transcript whose cue ids are worker-local strings", async () => {
    const project = await seedProject();
    const job = await seedLeasedTranscriptionJob(project, ACTIVE_LEASE);

    await expect(
      completeJob(job.jobId, job.leaseToken, transcriptCompletion()),
    ).resolves.toBe("completed");

    const cues = await pool.query<{
      id: string;
      text: string;
      words: unknown[];
    }>(
      `select cue.id, cue.text, cue.words
         from cues cue
         join subtitle_tracks track on track.id = cue.track_id
        where track.source_run_id = $1
        order by cue.position`,
      [job.runId],
    );
    expect(cues.rows.map((cue) => cue.text)).toEqual(["One", "Two"]);
    expect(cues.rows.every((cue) => isUuid(cue.id))).toBe(true);
    expect(cues.rows[1].words).toHaveLength(1);
    expect((await jobRow(job.jobId)).state).toBe("completed");
    expect(await runStatus(job.runId)).toBe("completed");
  });

  it("rejects a completion carrying the wrong lease token", async () => {
    const project = await seedProject();
    const job = await seedLeasedTranscriptionJob(project, ACTIVE_LEASE);

    await expect(
      completeJob(job.jobId, randomUUID(), transcriptCompletion()),
    ).resolves.toBe("lease-rejected");

    expect((await jobRow(job.jobId)).state).toBe("leased");
    const tracks = await pool.query(
      `select 1 from subtitle_tracks where source_run_id = $1`,
      [job.runId],
    );
    expect(tracks.rowCount).toBe(0);
  });

  it("rejects a transcript with invalid cue timing as unprocessable", async () => {
    const project = await seedProject();
    const job = await seedLeasedTranscriptionJob(project, ACTIVE_LEASE);
    const completion = transcriptCompletion();
    completion.artifact.cues[1].endUs = 9_000_000;

    await expect(
      completeJob(job.jobId, job.leaseToken, completion),
    ).rejects.toMatchObject({
      statusCode: 422,
      message: "Adapter returned invalid cue timing.",
    });
    expect((await jobRow(job.jobId)).state).toBe("leased");
  });

  it("rejects a completion of the wrong kind as unprocessable", async () => {
    const project = await seedProject();
    const job = await seedLeasedTranscriptionJob(project, ACTIVE_LEASE);

    await expect(
      completeJob(job.jobId, job.leaseToken, {
        kind: "media_prepare",
      } as unknown as TranscriptionJobCompletion),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect((await jobRow(job.jobId)).state).toBe("leased");
  });

  it("rejects a completion for an unknown job", async () => {
    await expect(
      completeJob(randomUUID(), randomUUID(), transcriptCompletion()),
    ).resolves.toBe("lease-rejected");
  });

  it("reports an already completed job even though its lease is gone", async () => {
    const project = await seedProject();
    const job = await seedLeasedTranscriptionJob(project, ACTIVE_LEASE);
    await completeJob(job.jobId, job.leaseToken, transcriptCompletion());

    await expect(
      completeJob(job.jobId, job.leaseToken, transcriptCompletion()),
    ).resolves.toBe("already-completed");
    const tracks = await pool.query(
      `select 1 from subtitle_tracks where source_run_id = $1`,
      [job.runId],
    );
    expect(tracks.rowCount).toBe(1);
  });

  it("rejects a completion after the lease expired", async () => {
    const project = await seedProject();
    const job = await seedLeasedTranscriptionJob(project, {
      ...ACTIVE_LEASE,
      expiresInSeconds: -1,
    });

    await expect(
      completeJob(job.jobId, job.leaseToken, transcriptCompletion()),
    ).resolves.toBe("lease-rejected");
    expect((await jobRow(job.jobId)).state).toBe("leased");
  });
});

describe("leaseJob reclaim", () => {
  function idleWorker(): WorkerManifest {
    return {
      protocolVersion: "1.0",
      workerId: randomUUID(),
      name: "reclaimer",
      version: "1.0.0",
      architecture: "x86_64",
      capabilities: { mediaPreparation: null },
      adapters: [],
      hardware: null,
    };
  }

  it("fails the job and its run once an expired lease used the last attempt", async () => {
    const project = await seedProject();
    const job = await seedLeasedTranscriptionJob(project, {
      attempts: 3,
      maxAttempts: 3,
      expiresInSeconds: -1,
    });

    await expect(leaseJob(idleWorker())).resolves.toBeNull();

    const reclaimed = await jobRow(job.jobId);
    expect(reclaimed.state).toBe("failed");
    expect(reclaimed.error).toMatchObject({
      code: "lease_expired",
      message: expect.stringContaining("ran out of memory"),
    });
    expect(await runStatus(job.runId)).toBe("failed");
  });

  it("requeues the job and its run while attempts remain", async () => {
    const project = await seedProject();
    const job = await seedLeasedTranscriptionJob(project, {
      ...ACTIVE_LEASE,
      expiresInSeconds: -1,
    });

    await expect(leaseJob(idleWorker())).resolves.toBeNull();

    expect((await jobRow(job.jobId)).state).toBe("queued");
    expect(await runStatus(job.runId)).toBe("queued");
  });
});

describe("failJob", () => {
  const FAILURE: JobFailure = {
    code: "adapter_error",
    message: "boom",
    retryable: true,
  };

  it("requeues a retryable failure and releases the worker", async () => {
    const project = await seedProject();
    const job = await seedLeasedTranscriptionJob(project, ACTIVE_LEASE);
    const workerId = randomUUID();
    await pool.query(
      `insert into workers (id, name, version, architecture, protocol_version, manifest)
       values ($1, 'worker', '1.0.0', 'x86_64', '1.0', '{}')`,
      [workerId],
    );
    await pool.query(`update jobs set leased_by = $2 where id = $1`, [
      job.jobId,
      workerId,
    ]);

    try {
      await expect(failJob(job.jobId, job.leaseToken, FAILURE)).resolves.toBe(
        true,
      );
      const failed = await jobRow(job.jobId);
      expect(failed.state).toBe("queued");
      expect(failed.leased_by).toBeNull();
      expect(await runStatus(job.runId)).toBe("queued");
    } finally {
      await pool.query(`delete from workers where id = $1`, [workerId]);
    }
  });

  it("fails the job and its run on a terminal failure", async () => {
    const project = await seedProject();
    const job = await seedLeasedTranscriptionJob(project, ACTIVE_LEASE);

    await expect(
      failJob(job.jobId, job.leaseToken, { ...FAILURE, retryable: false }),
    ).resolves.toBe(true);

    expect((await jobRow(job.jobId)).state).toBe("failed");
    expect(await runStatus(job.runId)).toBe("failed");
  });

  it("rejects a failure report after the lease expired", async () => {
    const project = await seedProject();
    const job = await seedLeasedTranscriptionJob(project, {
      ...ACTIVE_LEASE,
      expiresInSeconds: -1,
    });

    await expect(failJob(job.jobId, job.leaseToken, FAILURE)).resolves.toBe(
      false,
    );
    expect((await jobRow(job.jobId)).state).toBe("leased");
  });
});
