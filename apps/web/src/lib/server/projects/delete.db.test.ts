import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { pool } from "$lib/server/db";
import { lockForTransaction, lockKeys } from "$lib/server/db/locks";
import {
  seedLeasedTranscriptionJob,
  seedProject,
} from "$lib/server/db/testing/fixtures";
import { deleteProjectForUser } from "$lib/server/projects/delete";

const ACTIVE_LEASE = { attempts: 1, maxAttempts: 3, expiresInSeconds: 60 };

async function rowExists(table: "projects" | "jobs", id: string) {
  const result = await pool.query(`select 1 from ${table} where id = $1`, [id]);
  return result.rowCount === 1;
}

describe("deleteProjectForUser", () => {
  it("refuses a user outside the workspace and keeps the project", async () => {
    const project = await seedProject();
    const job = await seedLeasedTranscriptionJob(project, ACTIVE_LEASE);

    await expect(
      deleteProjectForUser(project.projectId, randomUUID()),
    ).resolves.toBe(false);

    expect(await rowExists("projects", project.projectId)).toBe(true);
    expect(await rowExists("jobs", job.jobId)).toBe(true);
  });

  it("refuses a non-member without waiting on the project's locks", async () => {
    const project = await seedProject();
    const holder = await pool.connect();
    try {
      await holder.query("begin");
      await lockForTransaction(
        holder,
        lockKeys.projectMedia(project.projectId),
      );
      await holder.query("select 1 from projects where id = $1 for update", [
        project.projectId,
      ]);

      const outcome = await Promise.race([
        deleteProjectForUser(project.projectId, randomUUID()),
        new Promise((resolve) => setTimeout(resolve, 2_000, "blocked")),
      ]);
      expect(outcome).toBe(false);
    } finally {
      await holder.query("rollback");
      holder.release();
    }
  });

  it("deletes the project together with its active jobs", async () => {
    const project = await seedProject();
    const job = await seedLeasedTranscriptionJob(project, ACTIVE_LEASE);

    await expect(
      deleteProjectForUser(project.projectId, project.userId),
    ).resolves.toBe(true);

    expect(await rowExists("projects", project.projectId)).toBe(false);
    expect(await rowExists("jobs", job.jobId)).toBe(false);
  });
});
