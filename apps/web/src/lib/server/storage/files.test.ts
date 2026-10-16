import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { linkIdempotent } from "./files";

describe("linkIdempotent", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "anysub-link-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("creates the link once and accepts a repeat", async () => {
    const source = join(directory, "source");
    const destination = join(directory, "destination");
    await writeFile(source, "media");

    expect(await linkIdempotent(source, destination)).toBe(true);
    expect(await linkIdempotent(source, destination)).toBe(false);
    expect((await stat(destination)).ino).toBe((await stat(source)).ino);
  });

  it("rejects a destination that is a different file", async () => {
    const source = join(directory, "source");
    const destination = join(directory, "destination");
    await writeFile(source, "media");
    await writeFile(destination, "media");

    await expect(linkIdempotent(source, destination)).rejects.toThrow(
      "already occupied",
    );
  });

  it("propagates other filesystem errors", async () => {
    await expect(
      linkIdempotent(join(directory, "missing"), join(directory, "out")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
