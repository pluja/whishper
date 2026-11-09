import { mkdir, rm, stat, unlink } from "node:fs/promises";
import { dirname } from "node:path";

import type {
  MediaDerivativeKind,
  MediaDerivativeUpload,
  MediaPreparationJobCompletion,
  MediaPreparationJobPayload,
} from "@anysub/contracts";
import { and, eq, notInArray } from "drizzle-orm";

import type { Executor } from "$lib/server/db";
import { mediaDerivatives, projects } from "$lib/server/db/schema";
import { unprocessable } from "$lib/server/http/errors";
import {
  ARTIFACT_DIRECTORIES,
  ARTIFACT_EXTENSIONS,
  ARTIFACT_LIMITS,
  ARTIFACT_MEDIA_TYPES,
} from "$lib/server/media/derivatives";
import { stagedArtifactPath } from "$lib/server/media/artifact-staging";
import {
  primaryFrameRate,
  requiredArtifactKinds,
} from "$lib/server/media/probe";
import { linkIdempotent } from "$lib/server/storage/files";
import {
  derivativeStorageKey,
  resolveDataPath,
  workerArtifactsPath,
} from "$lib/server/storage/paths";

export type MediaFinalizationInput = {
  jobId: string;
  attempt: number;
  workspaceId: string;
  payload: MediaPreparationJobPayload;
  completion: MediaPreparationJobCompletion;
};

export type MediaFinalizationPlan = {
  artifacts: MediaDerivativeUpload[];
  finalKeys: Map<MediaDerivativeKind, string>;
  createdPaths: string[];
  stagingRoot: string;
};

// Links the staged derivatives into project storage before the database
// records them, because a transaction cannot wait on the filesystem.
export async function linkMediaArtifacts(
  input: MediaFinalizationInput,
): Promise<MediaFinalizationPlan> {
  const artifacts = validatedArtifacts(input.completion);
  const createdPaths: string[] = [];
  const finalKeys = new Map<MediaDerivativeKind, string>();
  try {
    for (const artifact of artifacts) {
      const stagedPath = stagedArtifactPath(
        input.jobId,
        input.attempt,
        artifact.kind,
      );
      const stagedFile = await stat(stagedPath).catch(() => null);
      if (!stagedFile?.isFile() || stagedFile.size !== artifact.sizeBytes) {
        throw unprocessable(
          `Staged ${artifact.kind} derivative is incomplete.`,
        );
      }
      const storageKey = artifactStorageKey(
        input.workspaceId,
        input.payload.projectId,
        input.jobId,
        artifact,
      );
      const destination = resolveDataPath(storageKey);
      await mkdir(dirname(destination), { recursive: true });
      if (await linkIdempotent(stagedPath, destination)) {
        createdPaths.push(destination);
      }
      finalKeys.set(artifact.kind, storageKey);
    }
  } catch (cause) {
    await removePaths(createdPaths);
    throw cause;
  }
  return {
    artifacts,
    finalKeys,
    createdPaths,
    stagingRoot: workerArtifactsPath(input.jobId),
  };
}

// Returns the files of replaced derivatives, to delete once this commits.
export function recordMediaFinalization(
  tx: Executor,
  input: MediaFinalizationInput,
  plan: MediaFinalizationPlan,
): string[] {
  const { completion, payload } = input;
  const project = tx
    .select({ mediaOriginalKey: projects.mediaOriginalKey })
    .from(projects)
    .where(eq(projects.id, payload.projectId))
    .get();
  if (project?.mediaOriginalKey !== payload.sourceStorageKey) {
    throw unprocessable(
      "Project source changed before media preparation completed.",
    );
  }

  const previous = tx
    .select({
      kind: mediaDerivatives.kind,
      storageKey: mediaDerivatives.storageKey,
    })
    .from(mediaDerivatives)
    .where(eq(mediaDerivatives.projectId, payload.projectId))
    .all();

  const frameRate = primaryFrameRate(completion.probe);
  tx.update(projects)
    .set({
      mediaDurationUs: completion.probe.durationUs,
      mediaPreparationStatus: "completed",
      mediaProbe: { ...completion.probe },
      mediaFrameRateNum: frameRate?.numerator ?? null,
      mediaFrameRateDen: frameRate?.denominator ?? null,
      mediaSeekable: completion.probe.seekable,
      mediaProxyRecommended: completion.probe.proxyRecommended,
    })
    .where(eq(projects.id, payload.projectId))
    .run();

  tx.delete(mediaDerivatives)
    .where(
      and(
        eq(mediaDerivatives.projectId, payload.projectId),
        notInArray(
          mediaDerivatives.kind,
          plan.artifacts.map((artifact) => artifact.kind),
        ),
      ),
    )
    .run();

  const now = new Date();
  for (const artifact of plan.artifacts) {
    const row = {
      jobId: input.jobId,
      status: "ready" as const,
      storageKey: plan.finalKeys.get(artifact.kind) ?? "",
      sourceStorageKey: payload.sourceStorageKey,
      mediaType: artifact.mediaType,
      sizeBytes: artifact.sizeBytes,
      schemaVersion: artifact.schemaVersion,
      generatorVersion: artifact.generatorVersion,
      metadata: { ...artifact.metadata, generator: completion.generator },
      createdAt: now,
      updatedAt: now,
    };
    tx.insert(mediaDerivatives)
      .values({ projectId: payload.projectId, kind: artifact.kind, ...row })
      .onConflictDoUpdate({
        target: [mediaDerivatives.projectId, mediaDerivatives.kind],
        set: row,
      })
      .run();
  }

  return previous
    .filter(({ kind, storageKey }) => plan.finalKeys.get(kind) !== storageKey)
    .map(({ storageKey }) => resolveDataPath(storageKey));
}

export async function commitMediaFinalization(
  plan: MediaFinalizationPlan,
  obsoletePaths: string[],
): Promise<void> {
  await Promise.all([
    removePaths(obsoletePaths),
    rm(plan.stagingRoot, { recursive: true, force: true }),
  ]);
}

export async function rollbackMediaFinalization(
  plan: MediaFinalizationPlan,
): Promise<void> {
  await removePaths(plan.createdPaths);
}

async function removePaths(paths: string[]): Promise<void> {
  await Promise.all(paths.map((path) => unlink(path).catch(() => undefined)));
}

function validatedArtifacts(
  completion: MediaPreparationJobCompletion,
): MediaDerivativeUpload[] {
  assertDerivativesAllowed(completion);
  const artifacts = new Map<MediaDerivativeKind, MediaDerivativeUpload>();
  for (const artifact of completion.artifacts) {
    if (artifacts.has(artifact.kind)) {
      throw unprocessable(
        `Worker returned duplicate ${artifact.kind} derivatives.`,
      );
    }
    artifacts.set(artifact.kind, artifact);
  }
  for (const kind of requiredArtifactKinds(completion.probe)) {
    if (!artifacts.has(kind)) {
      throw unprocessable(
        `Worker did not upload the required ${kind} derivative.`,
      );
    }
  }
  return [...artifacts.values()];
}

function artifactStorageKey(
  workspaceId: string,
  projectId: string,
  jobId: string,
  artifact: MediaDerivativeUpload,
): string {
  const extension = ARTIFACT_EXTENSIONS[artifact.mediaType];
  if (!extension)
    throw unprocessable(
      "Worker returned an unsupported derivative media type.",
    );
  return derivativeStorageKey(
    workspaceId,
    projectId,
    ARTIFACT_DIRECTORIES[artifact.kind],
    `${jobId}${extension}`,
  );
}

function assertDerivativesAllowed(
  completion: MediaPreparationJobCompletion,
): void {
  for (const artifact of completion.artifacts) {
    if (
      !ARTIFACT_MEDIA_TYPES[artifact.kind].includes(artifact.mediaType) ||
      artifact.sizeBytes > ARTIFACT_LIMITS[artifact.kind]
    ) {
      throw unprocessable("Worker returned an invalid derivative manifest.");
    }
  }
}
