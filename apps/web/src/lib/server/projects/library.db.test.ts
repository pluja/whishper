import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "$lib/server/db";
import { projects as projectsTable } from "$lib/server/db/schema";
import { seedProject } from "$lib/server/db/testing/fixtures";
import {
  listLibraryProjects,
  primaryWorkspaceForUser,
  renameProjectForUser,
} from "$lib/server/projects/library";

function projectName(projectId: string): string | undefined {
  return db
    .select({ name: projectsTable.name })
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId))
    .get()?.name;
}

describe("renameProjectForUser", () => {
  it("renames a project for a workspace member", async () => {
    const project = await seedProject();

    expect(
      renameProjectForUser(db, project.projectId, project.userId, "Final"),
    ).toBe(true);
    expect(projectName(project.projectId)).toBe("Final");
  });

  it("leaves a project of another workspace untouched", async () => {
    const project = await seedProject();
    const outsider = await seedProject();

    expect(
      renameProjectForUser(db, project.projectId, outsider.userId, "Mine"),
    ).toBe(false);
    expect(projectName(project.projectId)).toBe("Project");
  });
});

describe("project library", () => {
  it("counts and lists the projects of the user's workspace", async () => {
    const project = await seedProject();
    db.update(projectsTable)
      .set({ mediaDurationUs: 7_200_000_000 })
      .where(eq(projectsTable.id, project.projectId))
      .run();

    expect(primaryWorkspaceForUser(db, project.userId)).toMatchObject({
      id: project.workspaceId,
      projectCount: 1,
      readySourceCount: 0,
    });
    const projects = listLibraryProjects(db, project.workspaceId, {
      query: "",
      includeSubtitles: false,
    });
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      id: project.projectId,
      mediaDurationUs: 7_200_000_000,
      trackCount: 0,
      cueCount: 0,
    });
  });
});
