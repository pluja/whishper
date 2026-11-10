import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "$lib/server/db";
import {
  cues,
  mediaUploads,
  projects as projectsTable,
} from "$lib/server/db/schema";
import { seedProject, seedTrack } from "$lib/server/db/testing/fixtures";
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
  it("reports an upload without progress for ten minutes as paused", async () => {
    const project = await seedProject();
    const lastProgressAt = new Date("2026-01-01T12:00:00Z");
    db.insert(mediaUploads)
      .values({
        id: randomUUID(),
        workspaceId: project.workspaceId,
        projectId: project.projectId,
        createdBy: project.userId,
        originalFilename: "interview.mp4",
        sizeBytes: 1_000,
        receivedBytes: 400,
        updatedAt: lastProgressAt,
      })
      .run();
    const uploadStatusAt = (minutesLater: number) =>
      listLibraryProjects(
        db,
        project.workspaceId,
        { query: "", includeSubtitles: false },
        new Date(lastProgressAt.getTime() + minutesLater * 60_000),
      )[0].uploadStatus;

    expect(uploadStatusAt(9)).toBe("uploading");
    expect(uploadStatusAt(10)).toBe("paused");
  });

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
    });
  });
});

describe("project library search", () => {
  function seedNamedProject(name: string, cueText: string) {
    const project = seedProject();
    db.update(projectsTable)
      .set({ name })
      .where(eq(projectsTable.id, project.projectId))
      .run();
    db.insert(cues)
      .values({
        trackId: seedTrack(project.projectId),
        position: 0,
        startUs: 0,
        endUs: 1_000_000,
        text: cueText,
      })
      .run();
    return project;
  }

  const foundNames = (
    workspaceId: string,
    query: string,
    includeSubtitles: boolean,
  ) =>
    listLibraryProjects(db, workspaceId, { query, includeSubtitles }).map(
      (project) => project.name,
    );

  it("matches titles regardless of case and accents", () => {
    const project = seedNamedProject("Entrevista Café", "Hola");

    expect(foundNames(project.workspaceId, "cafe", false)).toEqual([
      "Entrevista Café",
    ]);
    expect(foundNames(project.workspaceId, "ÉNTREVISTA", false)).toEqual([
      "Entrevista Café",
    ]);
  });

  it("matches subtitle text regardless of case and accents only when asked", () => {
    const project = seedNamedProject("Interview", "Él habló de la canción");

    expect(foundNames(project.workspaceId, "cancion", true)).toEqual([
      "Interview",
    ]);
    expect(foundNames(project.workspaceId, "EL HABLO", true)).toEqual([
      "Interview",
    ]);
    expect(foundNames(project.workspaceId, "cancion", false)).toEqual([]);
  });
});
