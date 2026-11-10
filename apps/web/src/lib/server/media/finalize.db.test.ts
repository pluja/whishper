import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  MEDIA_PREPARATION_VERSION,
  type MediaPreparationJobCompletion,
  type MediaPreparationJobPayload,
  type WorkerLease,
  type WorkerManifest,
} from "@anysub/contracts";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({ dataRoot: "" }));

vi.mock("$lib/server/env", () => ({
  privateEnv: {
    databaseFile: ":memory:",
    get dataRoot() {
      return testState.dataRoot;
    },
  },
}));

import { db } from "$lib/server/db";
import { jobs, mediaDerivatives } from "$lib/server/db/schema";
import {
  seedProject,
  type SeededProject,
} from "$lib/server/db/testing/fixtures";
import { completeJob } from "$lib/server/jobs/completion";
import { leaseJob } from "$lib/server/jobs/lease";
import { stagedArtifactPath } from "$lib/server/media/artifact-staging";
import { linkMediaArtifacts } from "$lib/server/media/finalize";
import { resolveDataPath } from "$lib/server/storage/paths";

const WAVEFORM_TYPE = "application/vnd.anysub.waveform+json";

const mediaWorker: WorkerManifest = {
  protocolVersion: "1.0",
  workerId: randomUUID(),
  name: "media-worker",
  version: "1.0.0",
  architecture: "x86_64",
  capabilities: {
    mediaPreparation: MEDIA_PREPARATION_VERSION,
    modelCache: null,
  },
  adapters: [],
  hardware: null,
  modelStorage: null,
};

type SeededMediaJob = {
  project: SeededProject;
  jobId: string;
  payload: MediaPreparationJobPayload;
};

function seedMediaJob(): SeededMediaJob {
  const sourceStorageKey = "originals/source.mp3";
  const project = seedProject({ mediaOriginalKey: sourceStorageKey });
  const payload: MediaPreparationJobPayload = {
    kind: "media_prepare",
    projectId: project.projectId,
    sourceStorageKey,
    sourceFilename: "source.mp3",
  };
  const job = db
    .insert(jobs)
    .values({
      workspaceId: project.workspaceId,
      projectId: project.projectId,
      kind: "media_prepare",
      payload,
    })
    .returning({ id: jobs.id })
    .get();
  return { project, jobId: job.id, payload };
}

async function lease(): Promise<WorkerLease> {
  const leased = await leaseJob(mediaWorker);
  if (!leased) throw new Error("Expected a lease");
  return leased;
}

async function stageWaveform(
  lease: WorkerLease,
  content: string,
): Promise<MediaPreparationJobCompletion> {
  const path = stagedArtifactPath(lease.jobId, lease.attempt, "waveform");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  return {
    kind: "media_prepare",
    probe: {
      schemaVersion: "1.0",
      durationUs: 5_000_000,
      startUs: 0,
      formatNames: ["mp3"],
      formatLongName: null,
      bitRate: null,
      seekable: true,
      frameRateMode: "unknown",
      proxyRecommended: false,
      proxyReasons: [],
      streams: [
        {
          index: 0,
          type: "audio",
          codec: "mp3",
          durationUs: 5_000_000,
          bitRate: null,
          audio: { sampleRate: 44_100, channels: 2, channelLayout: "stereo" },
          video: null,
        },
      ],
    },
    artifacts: [
      {
        kind: "waveform",
        mediaType: WAVEFORM_TYPE,
        sizeBytes: Buffer.byteLength(content),
        schemaVersion: "1.0",
        generatorVersion: "1.0",
        metadata: {},
      },
    ],
    generator: { id: "ffmpeg", version: "7.1" },
  };
}

function derivatives(projectId: string) {
  return db
    .select({
      kind: mediaDerivatives.kind,
      storageKey: mediaDerivatives.storageKey,
      jobId: mediaDerivatives.jobId,
    })
    .from(mediaDerivatives)
    .where(eq(mediaDerivatives.projectId, projectId))
    .all();
}

function readStored(storageKey: string): Promise<string> {
  return readFile(resolveDataPath(storageKey), "utf8");
}

beforeAll(async () => {
  testState.dataRoot = await mkdtemp(join(tmpdir(), "anysub-finalize-"));
});
afterAll(() => rm(testState.dataRoot, { recursive: true, force: true }));

describe("media preparation completion", () => {
  it("completes after an earlier attempt stopped between linking and recording", async () => {
    const { project, jobId, payload } = seedMediaJob();
    const first = await lease();
    await linkMediaArtifacts({
      jobId,
      attempt: first.attempt,
      workspaceId: project.workspaceId,
      payload,
      completion: await stageWaveform(first, "first"),
    });
    db.update(jobs)
      .set({ leaseExpiresAt: new Date(Date.now() - 1_000) })
      .where(eq(jobs.id, jobId))
      .run();

    const second = await lease();
    expect(second.attempt).toBe(2);
    await expect(
      completeJob(
        jobId,
        second.leaseToken,
        await stageWaveform(second, "second"),
      ),
    ).resolves.toBe("completed");

    const [derivative] = derivatives(project.projectId);
    expect(await readStored(derivative.storageKey)).toBe("second");
  });
});
