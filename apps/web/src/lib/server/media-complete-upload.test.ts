import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());

vi.mock("$lib/server/db", () => ({ pool: { query } }));
vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
  mkdir: vi.fn().mockRejectedValue(new Error("EACCES")),
}));

import { completeUpload } from "./media";

describe("completeUpload", () => {
  beforeEach(() => {
    query.mockReset();
    query.mockImplementation(async (sql: string) =>
      sql.includes("from media_uploads where id")
        ? {
            rows: [
              {
                projectId: "p1",
                workspaceId: "w1",
                originalFilename: "a.mp4",
                mediaType: null,
                storageKey: null,
                status: "uploading",
              },
            ],
          }
        : { rows: [] },
    );
  });

  it("stamps the first finalize attempt before filesystem setup can fail", async () => {
    await expect(completeUpload("u1", "user")).rejects.toThrow("EACCES");
    const statements = query.mock.calls.map(([sql]) => String(sql));
    const stampIndex = statements.findIndex((sql) =>
      sql.includes("first_finalize_attempt_at"),
    );
    const resetIndex = statements.findIndex((sql) =>
      sql.includes("status = 'uploading'"),
    );
    expect(stampIndex).toBeGreaterThan(0);
    expect(resetIndex).toBeGreaterThan(stampIndex);
  });
});
