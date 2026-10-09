import { randomUUID } from "node:crypto";

import type {
  TranscriptionJobCompletion,
  WorkerManifest,
} from "@anysub/contracts";
import { describe, expect, it } from "vitest";

import { pool } from "$lib/server/db";
import {
  seedLeasedTranscriptionJob,
  seedProject,
} from "$lib/server/db/testing/fixtures";
import { completeJob, leaseJob } from "$lib/server/queue";
import { isUuid } from "$lib/uuid";

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
  const result = await pool.query<{ state: string; error: unknown }>(
    `select state, error from jobs where id = $1`,
    [jobId],
  );
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
  it("fails the job and its run once an expired lease used the last attempt", async () => {
    const project = await seedProject();
    const job = await seedLeasedTranscriptionJob(project, {
      attempts: 3,
      maxAttempts: 3,
      expiresInSeconds: -1,
    });
    const manifest: WorkerManifest = {
      protocolVersion: "1.0",
      workerId: randomUUID(),
      name: "reclaimer",
      version: "1.0.0",
      architecture: "x86_64",
      capabilities: { mediaPreparation: null },
      adapters: [],
      hardware: null,
    };

    await expect(leaseJob(manifest)).resolves.toBeNull();

    const reclaimed = await jobRow(job.jobId);
    expect(reclaimed.state).toBe("failed");
    expect(reclaimed.error).toMatchObject({ code: "lease_expired" });
    expect(await runStatus(job.runId)).toBe("failed");
  });
});
