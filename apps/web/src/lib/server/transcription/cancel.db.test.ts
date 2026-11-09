import { describe, expect, it } from "vitest";

import { pool } from "$lib/server/db";
import {
  seedLeasedTranscriptionJob,
  seedProject,
} from "$lib/server/db/testing/fixtures";
import { reportProgress } from "$lib/server/jobs/lease";
import { hasActiveTranscriptionRun } from "$lib/server/transcription/active-run";
import { cancelTranscriptionForUser } from "$lib/server/transcription/cancel";

const ACTIVE_LEASE = { attempts: 1, maxAttempts: 3, expiresInSeconds: 60 };

async function states(jobId: string, runId: string) {
  const job = await pool.query<{ state: string }>(
    `select state from jobs where id = $1`,
    [jobId],
  );
  const run = await pool.query<{ status: string }>(
    `select status from transcription_runs where id = $1`,
    [runId],
  );
  return { job: job.rows[0].state, run: run.rows[0].status };
}

describe("cancelTranscriptionForUser", () => {
  it("cancels the running job and unlocks the project", async () => {
    const project = await seedProject();
    const job = await seedLeasedTranscriptionJob(project, ACTIVE_LEASE);

    await expect(
      cancelTranscriptionForUser(project.projectId, project.userId),
    ).resolves.toBe(true);

    expect(await states(job.jobId, job.runId)).toEqual({
      job: "cancelled",
      run: "cancelled",
    });
    expect(await hasActiveTranscriptionRun(pool, project.projectId)).toBe(
      false,
    );
  });

  it("makes the worker's next heartbeat fail so it drops the job", async () => {
    const project = await seedProject();
    const job = await seedLeasedTranscriptionJob(project, ACTIVE_LEASE);

    await cancelTranscriptionForUser(project.projectId, project.userId);

    await expect(
      reportProgress(job.jobId, job.leaseToken, 0.5, "Transcribing"),
    ).resolves.toBe(false);
  });

  it("leaves another workspace's transcription alone", async () => {
    const project = await seedProject();
    const outsider = await seedProject();
    const job = await seedLeasedTranscriptionJob(project, ACTIVE_LEASE);

    await expect(
      cancelTranscriptionForUser(project.projectId, outsider.userId),
    ).resolves.toBe(false);

    expect(await states(job.jobId, job.runId)).toEqual({
      job: "leased",
      run: "running",
    });
  });

  it("reports that nothing was active", async () => {
    const project = await seedProject();
    await expect(
      cancelTranscriptionForUser(project.projectId, project.userId),
    ).resolves.toBe(false);
  });
});
