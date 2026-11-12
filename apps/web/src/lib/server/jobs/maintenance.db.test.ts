import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "#lib/server/db/index.ts";
import { jobs, transcriptionRuns } from "#lib/server/db/schema.ts";
import {
  seedLeasedTranscriptionJob,
  seedProject,
} from "#lib/server/db/testing/fixtures.ts";
import { reclaimAbandonedJobs } from "#lib/server/jobs/maintenance.ts";

function jobAndRun(jobId: string) {
  return db
    .select({
      state: jobs.state,
      status: transcriptionRuns.status,
      progressMessage: jobs.progressMessage,
    })
    .from(jobs)
    .innerJoin(transcriptionRuns, eq(transcriptionRuns.id, jobs.runId))
    .where(eq(jobs.id, jobId))
    .get();
}

describe("reclaimAbandonedJobs", () => {
  it("requeues a job whose worker stopped heartbeating without any worker polling", async () => {
    const project = seedProject();
    const job = seedLeasedTranscriptionJob(project, {
      attempts: 1,
      maxAttempts: 3,
      expiresInSeconds: -1,
    });

    await reclaimAbandonedJobs();

    expect(jobAndRun(job.jobId)).toEqual({
      state: "queued",
      status: "queued",
      progressMessage: "The worker stopped before finishing. Trying again.",
    });
  });

  it("leaves a live lease alone", async () => {
    const project = seedProject();
    const job = seedLeasedTranscriptionJob(project, {
      attempts: 1,
      maxAttempts: 3,
      expiresInSeconds: 60,
    });

    await reclaimAbandonedJobs();

    expect(jobAndRun(job.jobId)?.state).toBe("leased");
  });
});
