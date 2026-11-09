import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "$lib/server/db";
import { jobs, projects } from "$lib/server/db/schema";
import {
  seedLeasedTranscriptionJob,
  seedMember,
  seedProject,
} from "$lib/server/db/testing/fixtures";
import { deleteProjectForUser } from "$lib/server/projects/delete";

const ACTIVE_LEASE = { attempts: 1, maxAttempts: 3, expiresInSeconds: 60 };

function projectExists(id: string): boolean {
  return (
    db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, id))
      .get() !== undefined
  );
}

function jobExists(id: string): boolean {
  return (
    db.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, id)).get() !==
    undefined
  );
}

describe("deleteProjectForUser", () => {
  it("refuses a user outside the workspace and keeps the project", async () => {
    const project = seedProject();
    const job = seedLeasedTranscriptionJob(project, ACTIVE_LEASE);

    await expect(
      deleteProjectForUser(project.projectId, randomUUID()),
    ).resolves.toBe(false);

    expect(projectExists(project.projectId)).toBe(true);
    expect(jobExists(job.jobId)).toBe(true);
  });

  it("refuses a plain member who did not create the project", async () => {
    const project = seedProject();
    const member = seedMember(project.workspaceId, "member");

    await expect(deleteProjectForUser(project.projectId, member)).resolves.toBe(
      false,
    );
    expect(projectExists(project.projectId)).toBe(true);
  });

  it("deletes the project together with its active jobs", async () => {
    const project = seedProject();
    const job = seedLeasedTranscriptionJob(project, ACTIVE_LEASE);

    await expect(
      deleteProjectForUser(project.projectId, project.userId),
    ).resolves.toBe(true);

    expect(projectExists(project.projectId)).toBe(false);
    expect(jobExists(job.jobId)).toBe(false);
  });
});
