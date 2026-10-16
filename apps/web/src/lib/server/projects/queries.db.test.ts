import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { pool } from "$lib/server/db";
import { seedProject } from "$lib/server/db/testing/fixtures";
import {
  latestMediaPreparation,
  latestRun,
  readyDerivatives,
  studioProject,
} from "$lib/server/projects/queries";

describe("studio queries", () => {
  it("maps the project and its upload to camelCase with numeric sizes", async () => {
    const project = await seedProject({ mediaOriginalKey: "media/source.mp4" });
    await pool.query(
      `insert into media_uploads
         (id, workspace_id, project_id, created_by, original_filename,
          media_type, size_bytes, status)
       values ($1, $2, $3, $4, 'clip.mp4', 'video/mp4', 6000000000, 'completed')`,
      [randomUUID(), project.workspaceId, project.projectId, project.userId],
    );

    await expect(studioProject(pool, project.projectId)).resolves.toMatchObject(
      {
        id: project.projectId,
        workspaceName: "Workspace",
        mediaOriginalKey: "media/source.mp4",
        mediaType: "video/mp4",
        uploadStatus: "completed",
        sizeBytes: 6_000_000_000,
        mediaPreparationStatus: "not_started",
      },
    );
  });

  it("returns empty results for a project without activity", async () => {
    const project = await seedProject();

    await expect(latestRun(pool, project.projectId)).resolves.toBeNull();
    await expect(
      latestMediaPreparation(pool, project.projectId),
    ).resolves.toBeNull();
    await expect(readyDerivatives(pool, project.projectId)).resolves.toEqual(
      [],
    );
  });
});
