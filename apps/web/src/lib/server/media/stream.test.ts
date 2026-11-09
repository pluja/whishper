import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseByteRange, safeMediaType, streamMediaFile } from "./stream";

describe("project media byte ranges", () => {
  it("parses bounded, open, and suffix ranges", () => {
    expect(parseByteRange("bytes=10-19", 100)).toEqual({ start: 10, end: 19 });
    expect(parseByteRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 });
    expect(parseByteRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
  });

  it("flags a single range that selects no bytes as unsatisfiable", () => {
    expect(parseByteRange("bytes=100-", 100)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=-0", 100)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=99999999999999999999-", 100)).toBe(
      "unsatisfiable",
    );
  });

  it("clamps an end past the file and a suffix longer than the file", () => {
    expect(parseByteRange("bytes=90-500", 100)).toEqual({ start: 90, end: 99 });
    expect(parseByteRange("bytes=-500", 100)).toEqual({ start: 0, end: 99 });
  });

  it("ignores multi-range, malformed and unsupported headers", () => {
    expect(parseByteRange("bytes=0-1,5-9", 100)).toBeNull();
    expect(parseByteRange("bytes=30-20", 100)).toBeNull();
    expect(parseByteRange("items=0-1", 100)).toBeNull();
    expect(parseByteRange(null, 100)).toBeNull();
  });
});

describe("safeMediaType", () => {
  it("serves anything else as an opaque download", () => {
    expect(safeMediaType("video/webm")).toBe("video/webm");
    expect(safeMediaType("text/html")).toBe("application/octet-stream");
    expect(safeMediaType(null)).toBe("application/octet-stream");
  });
});

describe("streamMediaFile", () => {
  let directory: string;
  let path: string;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "anysub-stream-"));
    path = join(directory, "clip.bin");
    await writeFile(path, "0123456789");
  });

  afterAll(() => rm(directory, { recursive: true, force: true }));

  const request = (range?: string) =>
    new Request("http://localhost/media", {
      headers: range ? { range } : {},
    });

  it("sends nosniff and the given content type", async () => {
    const response = await streamMediaFile(path, "video/mp4", request());

    expect(response?.status).toBe(200);
    expect(response?.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response?.headers.get("content-type")).toBe("video/mp4");
    expect(await response?.text()).toBe("0123456789");
  });

  it("answers HEAD with the headers and no body", async () => {
    const response = await streamMediaFile(
      path,
      "video/mp4",
      new Request("http://localhost/media", { method: "HEAD" }),
    );

    expect(response?.status).toBe(200);
    expect(response?.headers.get("content-length")).toBe("10");
    expect(response?.body).toBeNull();
  });

  it("serves a satisfiable range as 206", async () => {
    const response = await streamMediaFile(
      path,
      "video/mp4",
      request("bytes=2-4"),
    );

    expect(response?.status).toBe(206);
    expect(response?.headers.get("content-range")).toBe("bytes 2-4/10");
    expect(await response?.text()).toBe("234");
  });

  it("answers an out-of-bounds single range with 416", async () => {
    const response = await streamMediaFile(
      path,
      "video/mp4",
      request("bytes=50-"),
    );

    expect(response?.status).toBe(416);
    expect(response?.headers.get("content-range")).toBe("bytes */10");
  });

  it("ignores a multi-range header and sends the full file", async () => {
    const response = await streamMediaFile(
      path,
      "video/mp4",
      request("bytes=0-1,4-5"),
    );

    expect(response?.status).toBe(200);
    expect(await response?.text()).toBe("0123456789");
  });

  it("answers a zero-length suffix range with 416", async () => {
    const response = await streamMediaFile(
      path,
      "video/mp4",
      request("bytes=-0"),
    );

    expect(response?.status).toBe(416);
  });

  it("returns null for a directory", async () => {
    expect(await streamMediaFile(directory, "video/mp4", request())).toBeNull();
  });

  it("returns null for a missing file", async () => {
    expect(
      await streamMediaFile(join(directory, "gone"), "video/mp4", request()),
    ).toBeNull();
  });
});
