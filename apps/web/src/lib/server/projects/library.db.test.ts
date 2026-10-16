import { describe, expect, it } from "vitest";

import { pool } from "$lib/server/db";
import { seedProject } from "$lib/server/db/testing/fixtures";
import {
  listLibraryProjects,
  primaryWorkspaceForUser,
  renameProjectForUser,
} from "$lib/server/projects/library";

async function projectName(projectId: string): Promise<string> {
  const result = await pool.query<{ name: string }>(
    `select name from projects where id = $1`,
    [projectId],
  );
  return result.rows[0].name;
}

describe("renameProjectForUser", () => {
  it("renames a project for a workspace member", async () => {
    const project = await seedProject();

    await expect(
      renameProjectForUser(pool, project.projectId, project.userId, "Final"),
    ).resolves.toBe(true);
    expect(await projectName(project.projectId)).toBe("Final");
  });

  it("leaves a project of another workspace untouched", async () => {
    const project = await seedProject();
    const outsider = await seedProject();

    await expect(
      renameProjectForUser(pool, project.projectId, outsider.userId, "Mine"),
    ).resolves.toBe(false);
    expect(await projectName(project.projectId)).toBe("Project");
  });
});

describe("project library", () => {
  it("counts and lists the projects of the user's workspace", async () => {
    const project = await seedProject();
    await pool.query(
      `update projects set media_duration_us = 7200000000 where id = $1`,
      [project.projectId],
    );

    await expect(
      primaryWorkspaceForUser(pool, project.userId),
    ).resolves.toMatchObject({
      id: project.workspaceId,
      project_count: 1,
      ready_source_count: 0,
    });
    const projects = await listLibraryProjects(pool, project.workspaceId, {
      query: "",
      includeSubtitles: false,
    });
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      id: project.projectId,
      media_duration_us: 7_200_000_000,
      track_count: 0,
      cue_count: 0,
    });
  });
});
