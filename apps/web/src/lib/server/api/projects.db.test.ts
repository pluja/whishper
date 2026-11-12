import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const dataRoot = vi.hoisted(() => ({ path: "" }));

vi.mock("#lib/server/env.ts", () => ({
  privateEnv: {
    databaseFile: ":memory:",
    get dataRoot() {
      return dataRoot.path;
    },
  },
}));

import {
  createProjectFromBody,
  deleteProjectForApi,
  listProjects,
  projectForApi,
} from "#lib/server/api/projects.ts";
import { db } from "#lib/server/db/index.ts";
import { projects } from "#lib/server/db/schema.ts";
import { seedMember, seedProject } from "#lib/server/db/testing/fixtures.ts";
import { updateInstanceSettings } from "#lib/server/settings/instance.ts";
import { resolveDataPath } from "#lib/server/storage/paths.ts";

beforeAll(async () => {
  dataRoot.path = await mkdtemp(join(tmpdir(), "anysub-api-"));
});
afterAll(() => rm(dataRoot.path, { recursive: true, force: true }));

function upload(body: string, headers: Record<string, string> = {}): Request {
  return new Request("https://anysub.example/api/v1/projects", {
    method: "POST",
    body,
    headers: {
      "content-length": String(Buffer.byteLength(body)),
      "content-type": "video/mp4",
      ...headers,
    },
  });
}

describe("API projects", () => {
  it("list every workspace the user belongs to, a page at a time", () => {
    const own = seedProject();
    const shared = seedProject();
    const member = seedMember(shared.workspaceId, "member");
    db.insert(projects)
      .values({
        workspaceId: own.workspaceId,
        name: "Mine",
        createdBy: own.userId,
      })
      .run();

    const first = listProjects(member, { limit: 1 });
    expect(first.projects.map((project) => project.workspaceId)).toEqual([
      shared.workspaceId,
    ]);
    expect(first.nextCursor).toBeNull();

    const ownPage = listProjects(own.userId, { limit: 1 });
    const nextPage = listProjects(own.userId, {
      limit: 1,
      cursor: ownPage.nextCursor ?? undefined,
    });
    expect(ownPage.projects[0]?.name).toBe("Mine");
    expect(nextPage.projects[0]?.id).toBe(own.projectId);
    expect(nextPage.nextCursor).toBeNull();
  });

  it("hide projects outside the user's workspaces", () => {
    const project = seedProject();
    const stranger = seedProject();

    expect(() => projectForApi(stranger.userId, project.projectId)).toThrow(
      "Project not found.",
    );
  });

  it("can be deleted only with the rights the studio asks for", async () => {
    const project = seedProject();
    const member = seedMember(project.workspaceId, "member");

    await expect(
      deleteProjectForApi(member, project.projectId),
    ).rejects.toThrow("creator or a workspace owner or admin");
    await deleteProjectForApi(project.userId, project.projectId);
    expect(() => projectForApi(project.userId, project.projectId)).toThrow(
      "Project not found.",
    );
  });

  it("are created from a raw body like a browser upload", async () => {
    const { userId } = seedProject();

    const project = await createProjectFromBody(userId, upload("media bytes"), {
      filename: "Team call.mp4",
    });

    expect(project).toMatchObject({
      name: "Team call",
      sourceFilename: "Team call.mp4",
      media: { upload: "completed", preparation: "queued" },
    });
    const stored = db
      .select()
      .from(projects)
      .all()
      .find((row) => row.id === project.id);
    expect(
      await readFile(resolveDataPath(stored?.mediaOriginalKey ?? ""), "utf8"),
    ).toBe("media bytes");
  });

  it("leave nothing behind when the body is shorter than announced", async () => {
    const { userId } = seedProject();
    const before = db.select().from(projects).all().length;

    await expect(
      createProjectFromBody(
        userId,
        upload("short", { "content-length": "100" }),
        { filename: "clip.mp4" },
      ),
    ).rejects.toThrow();
    expect(db.select().from(projects).all()).toHaveLength(before);
  });

  it("refuse files that are not media or above the upload limit", async () => {
    const { userId } = seedProject();

    await expect(
      createProjectFromBody(
        userId,
        upload("<html>", { "content-type": "text/html" }),
        { filename: "page.html" },
      ),
    ).rejects.toThrow("Only audio and video");

    updateInstanceSettings({ maxUploadBytes: 4 });
    await expect(
      createProjectFromBody(userId, upload("too large"), { filename: "a.mp4" }),
    ).rejects.toThrow("upload limit");
  });
});
