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

import {
  MEDIA_PREPARATION_VERSION,
  type MediaPreparationJobCompletion,
  type MediaPreparationJobPayload,
  type WorkerLease,
  type WorkerManifest,
} from "@anysub/contracts";
import { eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const testState = vi.hoisted(() => ({
  dataRoot: "",
  afterLink: () => {},
}));

vi.mock("#lib/server/env.ts", () => ({
  privateEnv: {
    databaseFile: ":memory:",
    get dataRoot() {
      return testState.dataRoot;
    },
  },
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    link: async (...args: Parameters<typeof actual.link>) => {
      await actual.link(...args);
      testState.afterLink();
    },
  };
});

import { db } from "#lib/server/db/index.ts";
import { jobs, mediaDerivatives, projects } from "#lib/server/db/schema.ts";
import {
  seedProject,
  type SeededProject,
} from "#lib/server/db/testing/fixtures.ts";
import { completeJob } from "#lib/server/jobs/completion.ts";
import { leaseJob } from "#lib/server/jobs/lease.ts";
import { stagedArtifactPath } from "#lib/server/media/artifact-staging.ts";
import { linkMediaArtifacts } from "#lib/server/media/finalize.ts";
import {
  derivativeStorageKey,
  resolveDataPath,
  workerArtifactsPath,
} from "#lib/server/storage/paths.ts";

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
afterEach(() => {
  testState.afterLink = () => {};
});
afterAll(() => rm(testState.dataRoot, { recursive: true, force: true }));

describe("media preparation completion", () => {
  it("links the staged derivatives and records them", async () => {
    const { project, jobId } = seedMediaJob();
    const leased = await lease();
    const completion = await stageWaveform(leased, "peaks");

    await expect(
      completeJob(jobId, leased.leaseToken, completion),
    ).resolves.toBe("completed");

    const [derivative] = derivatives(project.projectId);
    expect(derivative).toMatchObject({ kind: "waveform", jobId });
    expect(await readStored(derivative.storageKey)).toBe("peaks");
    expect(
      db
        .select({
          status: projects.mediaPreparationStatus,
          durationUs: projects.mediaDurationUs,
        })
        .from(projects)
        .where(eq(projects.id, project.projectId))
        .get(),
    ).toEqual({ status: "completed", durationUs: 5_000_000 });
    await expect(stat(workerArtifactsPath(jobId))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("deletes the file of the derivative it replaces", async () => {
    const { project, jobId, payload } = seedMediaJob();
    const previousKey = derivativeStorageKey(
      project.workspaceId,
      project.projectId,
      "waveform",
      "previous.json",
    );
    await mkdir(dirname(resolveDataPath(previousKey)), { recursive: true });
    await writeFile(resolveDataPath(previousKey), "old");
    db.insert(mediaDerivatives)
      .values({
        projectId: project.projectId,
        kind: "waveform",
        storageKey: previousKey,
        sourceStorageKey: payload.sourceStorageKey,
        mediaType: WAVEFORM_TYPE,
        sizeBytes: 3,
        schemaVersion: "1.0",
        generatorVersion: "1.0",
      })
      .run();
    const leased = await lease();

    await completeJob(
      jobId,
      leased.leaseToken,
      await stageWaveform(leased, "new"),
    );

    const [derivative] = derivatives(project.projectId);
    expect(await readStored(derivative.storageKey)).toBe("new");
    await expect(stat(resolveDataPath(previousKey))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("removes the linked files when the lease ends before they are recorded", async () => {
    const { project, jobId } = seedMediaJob();
    const leased = await lease();
    const completion = await stageWaveform(leased, "peaks");
    testState.afterLink = () => {
      db.update(jobs)
        .set({ state: "cancelled" })
        .where(eq(jobs.id, jobId))
        .run();
    };

    await expect(
      completeJob(jobId, leased.leaseToken, completion),
    ).resolves.toBe("lease-rejected");

    expect(derivatives(project.projectId)).toEqual([]);
    const linkedKey = derivativeStorageKey(
      project.workspaceId,
      project.projectId,
      "waveform",
      `${jobId}.json`,
    );
    await expect(stat(resolveDataPath(linkedKey))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

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
