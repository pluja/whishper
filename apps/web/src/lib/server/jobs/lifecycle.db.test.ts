import { randomUUID } from "node:crypto";

import type {
  JobFailure,
  TranscriptionJobCompletion,
  WorkerManifest,
} from "@anysub/contracts";
import { describe, expect, it } from "vitest";

import { asc, eq } from "drizzle-orm";

import { db } from "#lib/server/db/index.ts";
import {
  cues as cuesTable,
  jobs,
  subtitleTracks,
  transcriptionRuns,
  workers,
} from "#lib/server/db/schema.ts";
import {
  seedLeasedTranscriptionJob,
  seedProject,
} from "#lib/server/db/testing/fixtures.ts";
import { completeJob } from "#lib/server/jobs/completion.ts";
import { failJob } from "#lib/server/jobs/failure.ts";
import {
  connectWorker,
  enqueueRemote,
  onlyJob,
  remoteWorker,
  seedRemoteModel,
  TEST_API_KEY,
} from "#lib/server/db/testing/remote.ts";
import { leaseJob } from "#lib/server/jobs/lease.ts";
import { removeProviderModel } from "#lib/server/transcription/providers.ts";
import { REMOTE_ADAPTER_ID } from "#lib/shared/transcription-models.ts";
import { isUuid } from "#lib/shared/uuid.ts";

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
      capabilities: {
        mediaPreparation: null,
        modelCache: null,
        remoteTranscription: null,
      },
      adapters: [],
      hardware: null,
      modelStorage: null,
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

  it("gives memory advice only for transcriptions", async () => {
    const job = db
      .insert(jobs)
      .values({
        kind: "model_cache",
        payload: {
          kind: "model_cache",
          action: "download",
          workerId: randomUUID(),
          adapterId: "whisperx",
          modelId: "small",
        },
        state: "leased",
        attempts: 1,
        maxAttempts: 1,
        leaseTokenHash: "expired",
        leaseExpiresAt: new Date(Date.now() - 1_000),
      })
      .returning({ id: jobs.id })
      .get();

    await leaseJob(idleWorker());

    expect(jobRow(job.id)).toMatchObject({
      state: "failed",
      error: {
        code: "lease_expired",
        message: "The worker stopped before finishing.",
      },
    });
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

describe("remote transcriptions", () => {
  it("hand the provider details to a capable worker only", async () => {
    const old = connectWorker(remoteWorker(false));
    const capable = connectWorker(remoteWorker(true));
    const { modelId } = seedRemoteModel();
    enqueueRemote(modelId);

    await expect(leaseJob(old)).resolves.toBeNull();
    const lease = await leaseJob(capable);

    expect(lease?.remote).toEqual({
      providerName: "Groq",
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: TEST_API_KEY,
      model: "whisper-large-v3",
    });
  });

  it("fail when the model was removed before a worker took the job", async () => {
    const capable = connectWorker(remoteWorker(true));
    const { modelId } = seedRemoteModel();
    enqueueRemote(modelId);
    removeProviderModel(modelId);

    await expect(leaseJob(capable)).resolves.toBeNull();

    const job = onlyJob();
    expect(job.state).toBe("failed");
    expect(job.error).toMatchObject({ code: "remote_model_removed" });
    expect(db.select().from(transcriptionRuns).get()?.status).toBe("failed");
  });

  it("name the transcript after the provider and price its length", async () => {
    const capable = connectWorker(remoteWorker(true));
    const { modelId } = seedRemoteModel(6_000);
    enqueueRemote(modelId);
    const lease = await leaseJob(capable);
    if (!lease) throw new Error("Expected a lease");
    const completion: TranscriptionJobCompletion = {
      kind: "transcribe",
      adapter: {
        id: REMOTE_ADAPTER_ID,
        version: "4.2.0",
        modelId: "whisper-large-v3",
      },
      artifact: {
        schemaVersion: "1.0",
        language: "en",
        durationUs: 150_000_000,
        metadata: { provider: "Groq" },
        cues: [
          { id: "c1", startUs: 0, endUs: 1_000_000, text: "Hi", words: [] },
        ],
      },
    };

    await completeJob(lease.jobId, lease.leaseToken, completion);

    expect(db.select().from(subtitleTracks).get()?.name).toBe(
      "Groq · whisper-large-v3",
    );
    expect(db.select().from(transcriptionRuns).get()?.estimatedCostMicros).toBe(
      15_000,
    );
  });

  it("do not blame memory when a remote worker vanishes", async () => {
    const capable = connectWorker(remoteWorker(true));
    const { modelId } = seedRemoteModel();
    enqueueRemote(modelId);
    const lease = await leaseJob(capable);
    if (!lease) throw new Error("Expected a lease");
    db.update(jobs)
      .set({ leaseExpiresAt: new Date(Date.now() - 1_000), attempts: 3 })
      .where(eq(jobs.id, lease.jobId))
      .run();

    await leaseJob(remoteWorker(false));

    expect(onlyJob().error).toMatchObject({
      code: "lease_expired",
      message: "The worker stopped before finishing.",
    });
  });
});
