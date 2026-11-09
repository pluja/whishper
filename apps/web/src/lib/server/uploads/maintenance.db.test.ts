import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { db } from "$lib/server/db";
import { mediaUploads, projects } from "$lib/server/db/schema";
import {
  seedProject,
  type SeededProject,
} from "$lib/server/db/testing/fixtures";
import {
  runUploadSweep,
  UPLOAD_EXPIRATION_MS,
} from "$lib/server/uploads/maintenance";

function seedFailedUpload(project: SeededProject): void {
  db.insert(mediaUploads)
    .values({
      id: randomUUID(),
      workspaceId: project.workspaceId,
      projectId: project.projectId,
      createdBy: project.userId,
      originalFilename: "clip.mp4",
      sizeBytes: 1024,
      status: "failed",
    })
    .run();
}

function projectExists(projectId: string): boolean {
  return (
    db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .get() !== undefined
  );
}

describe("runUploadSweep", () => {
  it("deletes expired projects without media and keeps completed ones", async () => {
    const abandoned = await seedProject();
    const completed = await seedProject({
      mediaOriginalKey: "media/original.mp4",
    });
    seedFailedUpload(abandoned);
    seedFailedUpload(completed);
    const removeTusUpload = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    await runUploadSweep(
      {
        finalizeUpload: vi.fn(),
        removeTusUpload,
        deleteExpiredTusFiles: vi.fn().mockResolvedValue(undefined),
      },
      new Date(Date.now() + UPLOAD_EXPIRATION_MS + 60_000),
    );

    expect(removeTusUpload).toHaveBeenCalledTimes(2);
    expect(projectExists(abandoned.projectId)).toBe(false);
    expect(projectExists(completed.projectId)).toBe(true);
  });
});
