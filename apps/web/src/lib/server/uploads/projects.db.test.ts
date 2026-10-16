import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { pool } from "$lib/server/db";
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
    await pool.query(
      `insert into media_uploads
         (id, workspace_id, project_id, created_by, original_filename, size_bytes)
       values ($1, $2, $3, $4, 'clip.mp4', 1024)`,
      [uploadId, project.workspaceId, project.projectId, project.userId],
    );

    await expect(completeUpload(uploadId, project.userId)).rejects.toThrow(
      "EACCES",
    );

    const upload = await pool.query<{
      status: string;
      error: string | null;
      first_finalize_attempt_at: Date | null;
    }>(
      `select status, error, first_finalize_attempt_at
         from media_uploads where id = $1`,
      [uploadId],
    );
    expect(upload.rows[0]).toMatchObject({
      status: "uploading",
      error: "EACCES",
      first_finalize_attempt_at: expect.any(Date),
    });
  });
});
