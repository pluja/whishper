import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "#lib/server/db/index.ts";
import { jobs, transcriptionRuns } from "#lib/server/db/schema.ts";
import {
  seedLeasedTranscriptionJob,
  seedProject,
} from "#lib/server/db/testing/fixtures.ts";
import { reportProgress } from "#lib/server/jobs/lease.ts";
import { hasActiveTranscriptionRun } from "#lib/server/transcription/active-run.ts";
import { cancelTranscriptionForUser } from "#lib/server/transcription/cancel.ts";

const ACTIVE_LEASE = { attempts: 1, maxAttempts: 3, expiresInSeconds: 60 };

function states(jobId: string, runId: string) {
  const job = db
    .select({ state: jobs.state })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .get();
  const run = db
    .select({ status: transcriptionRuns.status })
    .from(transcriptionRuns)
    .where(eq(transcriptionRuns.id, runId))
    .get();
  return { job: job?.state, run: run?.status };
}

describe("cancelTranscriptionForUser", () => {
  it("cancels the running job and unlocks the project", async () => {
    const project = await seedProject();
    const job = await seedLeasedTranscriptionJob(project, ACTIVE_LEASE);

    expect(cancelTranscriptionForUser(project.projectId, project.userId)).toBe(
      true,
    );

    expect(states(job.jobId, job.runId)).toEqual({
      job: "cancelled",
      run: "cancelled",
    });
    expect(await hasActiveTranscriptionRun(db, project.projectId)).toBe(false);
  });

  it("makes the worker's next heartbeat fail so it drops the job", async () => {
    const project = await seedProject();
    const job = await seedLeasedTranscriptionJob(project, ACTIVE_LEASE);

    await cancelTranscriptionForUser(project.projectId, project.userId);

    expect(reportProgress(job.jobId, job.leaseToken, 0.5, "Transcribing")).toBe(
      false,
    );
  });

  it("leaves another workspace's transcription alone", async () => {
    const project = await seedProject();
    const outsider = await seedProject();
    const job = await seedLeasedTranscriptionJob(project, ACTIVE_LEASE);

    expect(cancelTranscriptionForUser(project.projectId, outsider.userId)).toBe(
      false,
    );

    expect(states(job.jobId, job.runId)).toEqual({
      job: "leased",
      run: "running",
    });
  });

  it("reports that nothing was active", async () => {
    const project = await seedProject();
    expect(cancelTranscriptionForUser(project.projectId, project.userId)).toBe(
      false,
    );
  });
});
