import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { pool } from "$lib/server/db";
import {
  seedProject,
  type SeededProject,
} from "$lib/server/db/testing/fixtures";
import {
  runUploadSweep,
  UPLOAD_EXPIRATION_MS,
} from "$lib/server/upload-maintenance";

async function seedFailedUpload(project: SeededProject): Promise<void> {
  await pool.query(
    `insert into media_uploads
       (id, workspace_id, project_id, created_by, original_filename, size_bytes, status)
     values ($1, $2, $3, $4, 'clip.mp4', 1024, 'failed')`,
    [randomUUID(), project.workspaceId, project.projectId, project.userId],
  );
}

async function projectExists(projectId: string): Promise<boolean> {
  const result = await pool.query(`select 1 from projects where id = $1`, [
    projectId,
  ]);
  return result.rowCount === 1;
}

describe("runUploadSweep", () => {
  it("deletes expired projects without media and keeps completed ones", async () => {
    const abandoned = await seedProject();
    const completed = await seedProject({
      mediaOriginalKey: "media/original.mp4",
    });
    await seedFailedUpload(abandoned);
    await seedFailedUpload(completed);
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
    expect(await projectExists(abandoned.projectId)).toBe(false);
    expect(await projectExists(completed.projectId)).toBe(true);
  });
});
