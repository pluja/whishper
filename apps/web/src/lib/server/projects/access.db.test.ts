import { describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";

import { db } from "$lib/server/db";
import { memberships } from "$lib/server/db/schema";
import { seedMember, seedProject } from "$lib/server/db/testing/fixtures";
import {
  manageableProjectForUser,
  projectForUser,
} from "$lib/server/projects/access";

describe("projectForUser", () => {
  it("returns the project to a workspace member", async () => {
    const project = await seedProject({ mediaOriginalKey: "media/source.mp4" });
    const member = await seedMember(project.workspaceId, "member");

    expect(projectForUser(db, project.projectId, member)).toEqual({
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

    expect(projectForUser(db, project.projectId, outsider.userId)).toBeNull();
  });
});

describe("manageableProjectForUser", () => {
  it.each(["owner", "admin"] as const)(
    "lets a workspace %s manage another member's project",
    async (role) => {
      const project = await seedProject();
      const manager = await seedMember(project.workspaceId, role);

      expect(
        manageableProjectForUser(db, project.projectId, manager),
      ).toMatchObject({ id: project.projectId, canManage: true });
    },
  );

  it("lets the creator manage their project without an elevated role", async () => {
    const project = await seedProject();
    db.update(memberships)
      .set({ role: "member" })
      .where(eq(memberships.userId, project.userId))
      .run();

    expect(
      manageableProjectForUser(db, project.projectId, project.userId),
    ).toMatchObject({ canManage: true });
  });

  it("refuses a plain member who did not create the project", async () => {
    const project = await seedProject();
    const member = await seedMember(project.workspaceId, "member");

    expect(manageableProjectForUser(db, project.projectId, member)).toBeNull();
  });
});
