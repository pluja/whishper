import { randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const dataRoot = vi.hoisted(() => ({ path: "" }));

vi.mock("$lib/server/env", () => ({
  privateEnv: {
    databaseFile: ":memory:",
    get dataRoot() {
      return dataRoot.path;
    },
  },
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, mkdir: vi.fn(actual.mkdir) };
});

import { db } from "$lib/server/db";
import { jobs, mediaUploads, projects } from "$lib/server/db/schema";
import {
  seedProject,
  type SeededProject,
} from "$lib/server/db/testing/fixtures";
import { resolveDataPath, stagedUploadPath } from "$lib/server/storage/paths";
import { completeUpload } from "$lib/server/uploads/projects";

function seedUpload(project: SeededProject, sizeBytes: number): string {
  const uploadId = randomUUID();
  db.insert(mediaUploads)
    .values({
      id: uploadId,
      workspaceId: project.workspaceId,
      projectId: project.projectId,
      createdBy: project.userId,
      originalFilename: "clip.mp4",
      sizeBytes,
    })
    .run();
  return uploadId;
}

function uploadRow(uploadId: string) {
  return db
    .select({
      status: mediaUploads.status,
      storageKey: mediaUploads.storageKey,
      receivedBytes: mediaUploads.receivedBytes,
      error: mediaUploads.error,
      firstFinalizeAttemptAt: mediaUploads.firstFinalizeAttemptAt,
    })
    .from(mediaUploads)
    .where(eq(mediaUploads.id, uploadId))
    .get();
}

beforeAll(async () => {
  dataRoot.path = await mkdtemp(join(tmpdir(), "anysub-upload-"));
});
afterAll(() => rm(dataRoot.path, { recursive: true, force: true }));

describe("completeUpload", () => {
  it("moves the upload into the project and queues media preparation", async () => {
    const project = seedProject();
    const uploadId = seedUpload(project, 5);
    const stagingPath = stagedUploadPath(uploadId);
    await mkdir(dirname(stagingPath), { recursive: true });
    await writeFile(stagingPath, "media");

    const completed = await completeUpload(uploadId, project.userId);

    expect(completed.projectId).toBe(project.projectId);
    expect(await readFile(resolveDataPath(completed.storageKey), "utf8")).toBe(
      "media",
    );
    await expect(stat(stagingPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(uploadRow(uploadId)).toMatchObject({
      status: "completed",
      storageKey: completed.storageKey,
      receivedBytes: 5,
    });
    expect(
      db
        .select({
          mediaOriginalKey: projects.mediaOriginalKey,
          mediaFilename: projects.mediaFilename,
          mediaPreparationStatus: projects.mediaPreparationStatus,
        })
        .from(projects)
        .where(eq(projects.id, project.projectId))
        .get(),
    ).toEqual({
      mediaOriginalKey: completed.storageKey,
      mediaFilename: "clip.mp4",
      mediaPreparationStatus: "queued",
    });
    expect(
      db.select({ kind: jobs.kind, state: jobs.state }).from(jobs).all(),
    ).toEqual([{ kind: "media_prepare", state: "queued" }]);
    await expect(completeUpload(uploadId, project.userId)).resolves.toEqual(
      completed,
    );
  });

  it("stamps the first finalize attempt before filesystem setup can fail", async () => {
    const project = seedProject();
    const uploadId = seedUpload(project, 1024);
    vi.mocked(mkdir).mockRejectedValueOnce(new Error("EACCES"));

    await expect(completeUpload(uploadId, project.userId)).rejects.toThrow(
      "EACCES",
    );

    expect(uploadRow(uploadId)).toMatchObject({
      status: "uploading",
      error: "EACCES",
      firstFinalizeAttemptAt: expect.any(Date),
    });
  });
});
