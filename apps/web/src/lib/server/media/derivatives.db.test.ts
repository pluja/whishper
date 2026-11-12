import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "#lib/server/db/index.ts";
import { mediaDerivatives } from "#lib/server/db/schema.ts";
import {
  seedMember,
  seedProject,
  type SeededProject,
} from "#lib/server/db/testing/fixtures.ts";
import { deleteDerivativeForUser } from "#lib/server/media/derivatives.ts";

function seedThumbnail(project: SeededProject): void {
  db.insert(mediaDerivatives)
    .values({
      projectId: project.projectId,
      kind: "thumbnail",
      storageKey: `projects/${project.projectId}/thumbnails/poster.jpg`,
      sourceStorageKey: `projects/${project.projectId}/original.mp4`,
      mediaType: "image/jpeg",
      sizeBytes: 1_024,
      schemaVersion: "1",
      generatorVersion: "1",
    })
    .run();
}

function hasThumbnail(projectId: string): boolean {
  return (
    db
      .select({ id: mediaDerivatives.id })
      .from(mediaDerivatives)
      .where(eq(mediaDerivatives.projectId, projectId))
      .get() !== undefined
  );
}

describe("deleteDerivativeForUser", () => {
  it("refuses a plain member who did not create the project", async () => {
    const project = seedProject();
    seedThumbnail(project);
    const member = seedMember(project.workspaceId, "member");

    await expect(
      deleteDerivativeForUser(project.projectId, "thumbnail", member),
    ).resolves.toBe(false);
    expect(hasThumbnail(project.projectId)).toBe(true);
  });

  it("deletes the derivative for a user who manages the project", async () => {
    const project = seedProject();
    seedThumbnail(project);

    await expect(
      deleteDerivativeForUser(project.projectId, "thumbnail", project.userId),
    ).resolves.toBe(true);
    expect(hasThumbnail(project.projectId)).toBe(false);
  });
});
