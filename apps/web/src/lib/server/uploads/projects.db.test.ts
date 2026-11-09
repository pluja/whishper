import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { db } from "$lib/server/db";
import { mediaUploads } from "$lib/server/db/schema";
import { seedProject } from "$lib/server/db/testing/fixtures";
import { completeUpload } from "$lib/server/uploads/projects";

vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
  mkdir: vi.fn().mockRejectedValue(new Error("EACCES")),
}));

describe("completeUpload", () => {
  it("stamps the first finalize attempt before filesystem setup can fail", async () => {
    const project = await seedProject();
    const uploadId = randomUUID();
    db.insert(mediaUploads)
      .values({
        id: uploadId,
        workspaceId: project.workspaceId,
        projectId: project.projectId,
        createdBy: project.userId,
        originalFilename: "clip.mp4",
        sizeBytes: 1024,
      })
      .run();

    await expect(completeUpload(uploadId, project.userId)).rejects.toThrow(
      "EACCES",
    );

    const upload = db
      .select({
        status: mediaUploads.status,
        error: mediaUploads.error,
        firstFinalizeAttemptAt: mediaUploads.firstFinalizeAttemptAt,
      })
      .from(mediaUploads)
      .where(eq(mediaUploads.id, uploadId))
      .get();
    expect(upload).toMatchObject({
      status: "uploading",
      error: "EACCES",
      firstFinalizeAttemptAt: expect.any(Date),
    });
  });
});
