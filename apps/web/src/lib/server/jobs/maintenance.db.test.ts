import { describe, expect, it } from "vitest";

import { pool } from "$lib/server/db";
import {
  seedLeasedTranscriptionJob,
  seedProject,
} from "$lib/server/db/testing/fixtures";
import { reclaimAbandonedJobs } from "$lib/server/jobs/maintenance";

describe("reclaimAbandonedJobs", () => {
  it("requeues a job whose worker stopped heartbeating without any worker polling", async () => {
    const project = await seedProject();
    const job = await seedLeasedTranscriptionJob(project, {
      attempts: 1,
      maxAttempts: 3,
      expiresInSeconds: -1,
    });

    await reclaimAbandonedJobs();

    const reclaimed = await pool.query<{ state: string; status: string }>(
      `select j.state, r.status
         from jobs j join transcription_runs r on r.id = j.run_id
        where j.id = $1`,
      [job.jobId],
    );
    expect(reclaimed.rows[0]).toEqual({ state: "queued", status: "queued" });
  });

  it("leaves a live lease alone", async () => {
    const project = await seedProject();
    const job = await seedLeasedTranscriptionJob(project, {
      attempts: 1,
      maxAttempts: 3,
      expiresInSeconds: 60,
    });

    await reclaimAbandonedJobs();

    const live = await pool.query<{ state: string }>(
      `select state from jobs where id = $1`,
      [job.jobId],
    );
    expect(live.rows[0].state).toBe("leased");
  });
});
