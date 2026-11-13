import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "#lib/server/db/index.ts";
import { mediaUploads } from "#lib/server/db/schema.ts";
import { seedProject } from "#lib/server/db/testing/fixtures.ts";
import {
  DISK_RESERVE_BYTES,
  requireRoomForUpload,
} from "#lib/server/storage/usage.ts";

const GIB = 1024 ** 3;
const statfs = vi.hoisted(() => vi.fn());

vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
  statfs,
}));

function freeSpace(bytes: number): void {
  statfs.mockResolvedValue({ bsize: 1, blocks: 100 * GIB, bavail: bytes });
}

describe("requireRoomForUpload", () => {
  beforeEach(() => {
    statfs.mockReset();
  });

  it("keeps the reserve free", async () => {
    freeSpace(DISK_RESERVE_BYTES + 10 * GIB);

    await expect(requireRoomForUpload(db, 10 * GIB)).resolves.toBeUndefined();
    await expect(requireRoomForUpload(db, 10 * GIB + 1)).rejects.toMatchObject({
      statusCode: 413,
    });
  });

  it("counts what uploads in progress still have to write", async () => {
    const project = seedProject();
    db.insert(mediaUploads)
      .values({
        id: randomUUID(),
        workspaceId: project.workspaceId,
        projectId: project.projectId,
        createdBy: project.userId,
        originalFilename: "long.mp4",
        sizeBytes: 8 * GIB,
        receivedBytes: 2 * GIB,
      })
      .run();
    freeSpace(DISK_RESERVE_BYTES + 10 * GIB);

    await expect(requireRoomForUpload(db, 4 * GIB)).resolves.toBeUndefined();
    await expect(requireRoomForUpload(db, 5 * GIB)).rejects.toThrow(
      "low on disk space",
    );
  });

  it("lets uploads through when the volume size is unknown", async () => {
    statfs.mockImplementation(async () => {
      throw new Error("not supported");
    });

    await expect(requireRoomForUpload(db, 100 * GIB)).resolves.toBeUndefined();
  });
});
