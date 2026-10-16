import { describe, expect, it } from "vitest";

import { pool } from "$lib/server/db";
import { seedMember, seedProject } from "$lib/server/db/testing/fixtures";
import {
  manageableProjectForUser,
  projectForUser,
} from "$lib/server/projects/access";

describe("projectForUser", () => {
  it("returns the project to a workspace member", async () => {
    const project = await seedProject({ mediaOriginalKey: "media/source.mp4" });
    const member = await seedMember(project.workspaceId, "member");

    await expect(
      projectForUser(pool, project.projectId, member),
    ).resolves.toEqual({
      id: project.projectId,
      workspaceId: project.workspaceId,
      name: "Project",
      mediaOriginalKey: "media/source.mp4",
      canManage: false,
    });
  });

  it("hides the project from a user of another workspace", async () => {
    const project = await seedProject();
    const outsider = await seedProject();

    await expect(
      projectForUser(pool, project.projectId, outsider.userId),
    ).resolves.toBeNull();
  });
});

describe("manageableProjectForUser", () => {
  it.each(["owner", "admin"] as const)(
    "lets a workspace %s manage another member's project",
    async (role) => {
      const project = await seedProject();
      const manager = await seedMember(project.workspaceId, role);

      await expect(
        manageableProjectForUser(pool, project.projectId, manager),
      ).resolves.toMatchObject({ id: project.projectId, canManage: true });
    },
  );

  it("lets the creator manage their project without an elevated role", async () => {
    const project = await seedProject();
    await pool.query(
      `update memberships set role = 'member' where user_id = $1`,
      [project.userId],
    );

    await expect(
      manageableProjectForUser(pool, project.projectId, project.userId),
    ).resolves.toMatchObject({ canManage: true });
  });

  it("refuses a plain member who did not create the project", async () => {
    const project = await seedProject();
    const member = await seedMember(project.workspaceId, "member");

    await expect(
      manageableProjectForUser(pool, project.projectId, member),
    ).resolves.toBeNull();
  });
});
