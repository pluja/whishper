import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { db } from "#lib/server/db/index.ts";
import { mediaUploads } from "#lib/server/db/schema.ts";
import { seedProject } from "#lib/server/db/testing/fixtures.ts";
import {
  latestMediaPreparation,
  latestRun,
  readyDerivatives,
  studioProject,
  studioStatus,
} from "#lib/server/projects/studio.ts";

describe("studio queries", () => {
  it("maps the project and its upload to camelCase with numeric sizes", async () => {
    const project = await seedProject({ mediaOriginalKey: "media/source.mp4" });
    db.insert(mediaUploads)
      .values({
        id: randomUUID(),
        workspaceId: project.workspaceId,
        projectId: project.projectId,
        createdBy: project.userId,
        originalFilename: "clip.mp4",
        mediaType: "video/mp4",
        sizeBytes: 6_000_000_000,
        status: "completed",
      })
      .run();

    expect(studioProject(db, project.projectId)).toMatchObject({
      id: project.projectId,
      workspaceName: "Workspace",
      hasSourceMedia: true,
      mediaType: "video/mp4",
      uploadStatus: "completed",
      sizeBytes: 6_000_000_000,
      mediaPreparationStatus: "not_started",
    });
  });

  it("returns empty results for a project without activity", async () => {
    const project = await seedProject();

    expect(studioProject(db, project.projectId)).toMatchObject({
      hasSourceMedia: false,
    });

    expect(latestRun(db, project.projectId)).toBeNull();
    expect(latestMediaPreparation(db, project.projectId)).toBeNull();
    expect(readyDerivatives(db, project.projectId)).toEqual([]);
    expect(studioStatus(db, project.projectId)).toEqual({
      run: null,
      preparation: null,
    });
  });
});
