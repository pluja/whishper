import { randomUUID } from "node:crypto";

import type {
  JobFailure,
  TranscriptionJobCompletion,
  WorkerManifest,
} from "@anysub/contracts";
import { describe, expect, it } from "vitest";

import { asc, eq } from "drizzle-orm";

import { db } from "$lib/server/db";
import {
  cues as cuesTable,
  jobs,
  subtitleTracks,
  transcriptionRuns,
  workers,
} from "$lib/server/db/schema";
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

function jobRow(jobId: string) {
  const job = db
    .select({ state: jobs.state, error: jobs.error, leasedBy: jobs.leasedBy })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .get();
  if (!job) throw new Error(`Job ${jobId} is missing`);
  return job;
}

function runStatus(runId: string): string {
  const run = db
    .select({ status: transcriptionRuns.status })
    .from(transcriptionRuns)
    .where(eq(transcriptionRuns.id, runId))
    .get();
  if (!run) throw new Error(`Run ${runId} is missing`);
  return run.status;
}

function tracksOfRun(runId: string) {
  return db
    .select({ id: subtitleTracks.id })
    .from(subtitleTracks)
    .where(eq(subtitleTracks.sourceRunId, runId))
    .all();
}

describe("completeJob", () => {
  it("stores a transcript whose cue ids are worker-local strings", async () => {
    const project = await seedProject();
    const job = await seedLeasedTranscriptionJob(project, ACTIVE_LEASE);

    await expect(
      completeJob(job.jobId, job.leaseToken, transcriptCompletion()),
    ).resolves.toBe("completed");

    const cues = db
      .select({
        id: cuesTable.id,
        text: cuesTable.text,
        words: cuesTable.words,
      })
      .from(cuesTable)
      .innerJoin(subtitleTracks, eq(subtitleTracks.id, cuesTable.trackId))
      .where(eq(subtitleTracks.sourceRunId, job.runId))
      .orderBy(asc(cuesTable.position))
      .all();
    expect(cues.map((cue) => cue.text)).toEqual(["One", "Two"]);
    expect(cues.every((cue) => isUuid(cue.id))).toBe(true);
    expect(cues[1].words).toHaveLength(1);
    expect(jobRow(job.jobId).state).toBe("completed");
    expect(runStatus(job.runId)).toBe("completed");
  });

  it("rejects a completion carrying the wrong lease token", async () => {
    const project = await seedProject();
    const job = await seedLeasedTranscriptionJob(project, ACTIVE_LEASE);

    await expect(
      completeJob(job.jobId, randomUUID(), transcriptCompletion()),
    ).resolves.toBe("lease-rejected");

    expect(jobRow(job.jobId).state).toBe("leased");
    expect(tracksOfRun(job.runId)).toHaveLength(0);
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
    expect(jobRow(job.jobId).state).toBe("leased");
  });

  it("rejects a completion of the wrong kind as unprocessable", async () => {
    const project = await seedProject();
    const job = await seedLeasedTranscriptionJob(project, ACTIVE_LEASE);

    await expect(
      completeJob(job.jobId, job.leaseToken, {
        kind: "media_prepare",
      } as unknown as TranscriptionJobCompletion),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(jobRow(job.jobId).state).toBe("leased");
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
    expect(tracksOfRun(job.runId)).toHaveLength(1);
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
    expect(jobRow(job.jobId).state).toBe("leased");
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

    const reclaimed = jobRow(job.jobId);
    expect(reclaimed.state).toBe("failed");
    expect(reclaimed.error).toMatchObject({
      code: "lease_expired",
      message: expect.stringContaining("ran out of memory"),
    });
    expect(runStatus(job.runId)).toBe("failed");
  });

  it("requeues the job and its run while attempts remain", async () => {
    const project = await seedProject();
    const job = await seedLeasedTranscriptionJob(project, {
      ...ACTIVE_LEASE,
      expiresInSeconds: -1,
    });

    await expect(leaseJob(idleWorker())).resolves.toBeNull();

    expect(jobRow(job.jobId).state).toBe("queued");
    expect(runStatus(job.runId)).toBe("queued");
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
    db.insert(workers)
      .values({
        id: workerId,
        name: "worker",
        version: "1.0.0",
        architecture: "x86_64",
        protocolVersion: "1.0",
        manifest: {} as never,
      })
      .run();
    db.update(jobs)
      .set({ leasedBy: workerId })
      .where(eq(jobs.id, job.jobId))
      .run();

    await expect(failJob(job.jobId, job.leaseToken, FAILURE)).resolves.toBe(
      true,
    );
    const failed = jobRow(job.jobId);
    expect(failed.state).toBe("queued");
    expect(failed.leasedBy).toBeNull();
    expect(runStatus(job.runId)).toBe("queued");
  });

  it("fails the job and its run on a terminal failure", async () => {
    const project = await seedProject();
    const job = await seedLeasedTranscriptionJob(project, ACTIVE_LEASE);

    await expect(
      failJob(job.jobId, job.leaseToken, { ...FAILURE, retryable: false }),
    ).resolves.toBe(true);

    expect(jobRow(job.jobId).state).toBe("failed");
    expect(runStatus(job.runId)).toBe("failed");
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
    expect(jobRow(job.jobId).state).toBe("leased");
  });
});
