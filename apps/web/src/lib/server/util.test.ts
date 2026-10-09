import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  hashToken,
  isNodeError,
  isRecord,
  linkIdempotent,
  withKeyedLock,
} from "./util";

describe("isRecord", () => {
  it("accepts plain objects only", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord("text")).toBe(false);
  });
});

describe("isNodeError", () => {
  it("matches on the error code", () => {
    const cause = Object.assign(new Error("exists"), { code: "EEXIST" });
    expect(isNodeError(cause, "EEXIST")).toBe(true);
    expect(isNodeError(cause, "ENOENT")).toBe(false);
    expect(isNodeError({ code: "EEXIST" }, "EEXIST")).toBe(false);
  });
});

describe("hashToken", () => {
  it("returns the sha256 hex digest", () => {
    expect(hashToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

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

describe("withKeyedLock", () => {
  it("runs same-key work one at a time and keeps going after a failure", async () => {
    const order: string[] = [];
    const slow = withKeyedLock("k", async () => {
      order.push("slow:start");
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push("slow:end");
      throw new Error("boom");
    });
    const next = withKeyedLock("k", async () => {
      order.push("next");
      return "ok";
    });
    await expect(slow).rejects.toThrow("boom");
    await expect(next).resolves.toBe("ok");
    expect(order).toEqual(["slow:start", "slow:end", "next"]);
  });
});
