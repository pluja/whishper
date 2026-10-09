import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const dataRoot = vi.hoisted(() => ({ path: "" }));

vi.mock("$lib/server/db", () => ({ pool: { query: vi.fn() } }));
vi.mock("$lib/server/media", () => ({
  resolveDataPath: (key: string) => `${dataRoot.path}/${key}`,
}));
vi.mock("$lib/server/env", () => ({
  privateEnv: { maxUploadBytes: 1024 * 1024 * 1024 },
}));

import {
  appendArtifactChunk,
  stagedArtifactOffset,
  stagingArtifactPath,
  type MediaPreparationLease,
} from "./media-artifact-staging";

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
      await readFile(stagingArtifactPath(lease, "thumbnail"), "utf8"),
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

  it("serializes concurrent appends for the same lease", async () => {
    const path = stagingArtifactPath(lease, "waveform");
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
