import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const dataRoot = vi.hoisted(() => ({ path: "" }));

vi.mock("$lib/server/env", () => ({
  privateEnv: {
    databaseFile: ":memory:",
    maxUploadBytes: 1024 * 1024 * 1024,
    get dataRoot() {
      return dataRoot.path;
    },
  },
}));

import {
  appendArtifactChunk,
  openMediaPreparationSource,
  parseUploadInteger,
  stagedArtifactOffset,
  stagedArtifactPath,
  type MediaPreparationLease,
} from "./artifact-staging";

const lease = {
  jobId: "job-1",
  attempt: 1,
  workspaceId: "w",
  mediaType: null,
  payload: {},
} as unknown as MediaPreparationLease;

function bodyOf(...chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });
}

beforeAll(async () => {
  dataRoot.path = await mkdtemp(join(tmpdir(), "anysub-staging-"));
});
afterAll(() => rm(dataRoot.path, { recursive: true, force: true }));

describe("appendArtifactChunk", () => {
  it("appends a chunk that matches its declared length", async () => {
    const next = await appendArtifactChunk(
      lease,
      "thumbnail",
      0,
      10,
      5,
      bodyOf("he", "llo"),
    );
    expect(next).toBe(5);
    expect(
      await readFile(
        stagedArtifactPath(lease.jobId, lease.attempt, "thumbnail"),
        "utf8",
      ),
    ).toBe("hello");
  });

  it("rejects a body longer than the declared length and truncates it", async () => {
    await expect(
      appendArtifactChunk(lease, "thumbnail", 5, 20, 3, bodyOf("abcdef")),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(await stagedArtifactOffset(lease, "thumbnail")).toBe(5);
  });

  it("truncates back to the starting offset when the body is short", async () => {
    await expect(
      appendArtifactChunk(lease, "thumbnail", 5, 20, 6, bodyOf("ab")),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(await stagedArtifactOffset(lease, "thumbnail")).toBe(5);
  });

  it("stops a multi-chunk body once it passes the declared length", async () => {
    const path = stagedArtifactPath(lease.jobId, lease.attempt, "proxy");
    await expect(
      appendArtifactChunk(lease, "proxy", 0, 100, 6, bodyOf("abcd", "efgh")),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(await stagedArtifactOffset(lease, "proxy")).toBe(0);
    expect((await stat(path)).size).toBe(0);
  });

  it.each([Number.NaN, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects the invalid upload offset %s",
    async (offset) => {
      await expect(
        appendArtifactChunk(lease, "thumbnail", offset, 20, 1, bodyOf("a")),
      ).rejects.toMatchObject({ statusCode: 400 });
    },
  );

  it("serializes concurrent appends for the same lease", async () => {
    const path = stagedArtifactPath(lease.jobId, lease.attempt, "waveform");
    const results = await Promise.allSettled([
      appendArtifactChunk(lease, "waveform", 0, 10, 4, bodyOf("aaaa")),
      appendArtifactChunk(lease, "waveform", 0, 10, 4, bodyOf("bbbb")),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect((await stat(path)).size).toBe(4);
  });
});

describe("parseUploadInteger", () => {
  it("accepts plain non-negative decimal integers", () => {
    expect(parseUploadInteger("0")).toBe(0);
    expect(parseUploadInteger("1048576")).toBe(1048576);
  });

  it.each([null, "", " 5", "-1", "1.5", "1e3", "0x10", "abc"])(
    "maps %j to NaN",
    (header) => {
      expect(parseUploadInteger(header)).toBeNaN();
    },
  );
});
describe("openMediaPreparationSource", () => {
  it("answers 404 when the source file is missing", async () => {
    await expect(
      openMediaPreparationSource({
        ...lease,
        payload: { sourceStorageKey: "originals/missing.mp4" },
      } as MediaPreparationLease),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
