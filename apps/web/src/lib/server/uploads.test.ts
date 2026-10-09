import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { declaredUploadMediaType, removeStoredUpload } from "./uploads";

describe("declared upload media type", () => {
  it("accepts audio, video and the browser application aliases", () => {
    expect(declaredUploadMediaType("video/mp4")).toBe("video/mp4");
    expect(declaredUploadMediaType("application/ogg")).toBe("application/ogg");
  });

  it("treats a missing or empty type as unknown", () => {
    expect(declaredUploadMediaType(undefined)).toBeNull();
    expect(declaredUploadMediaType("  ")).toBeNull();
  });

  it("rejects other types with a 400", () => {
    expect(() => declaredUploadMediaType("text/html")).toThrow(
      expect.objectContaining({ status_code: 400 }),
    );
  });
});

describe("removeStoredUpload", () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "anysub-tus-"));
  });
  afterEach(() => rm(directory, { recursive: true, force: true }));

  it("deletes the data file and then the config entry", async () => {
    await writeFile(join(directory, "u1"), "data");
    const configstore = { delete: vi.fn().mockResolvedValue(undefined) };
    await removeStoredUpload({ directory, configstore } as never, "u1");
    await expect(stat(join(directory, "u1"))).rejects.toThrow();
    expect(configstore.delete).toHaveBeenCalledWith("u1");
  });

  it("still removes the config entry when the data file is already gone", async () => {
    const configstore = { delete: vi.fn().mockResolvedValue(undefined) };
    await removeStoredUpload({ directory, configstore } as never, "gone");
    expect(configstore.delete).toHaveBeenCalledWith("gone");
  });

  it("keeps the config entry when the data file cannot be removed", async () => {
    await mkdir(join(directory, "u2"));
    const configstore = { delete: vi.fn() };
    await expect(
      removeStoredUpload({ directory, configstore } as never, "u2"),
    ).rejects.toThrow();
    expect(configstore.delete).not.toHaveBeenCalled();
  });
});
