import { and, asc, desc, eq, sql } from "drizzle-orm";

import type { Executor } from "#lib/server/db/index.ts";
import {
  jobs,
  mediaDerivatives,
  mediaUploads,
  projects,
  transcriptionRuns,
  workspaces,
} from "#lib/server/db/schema.ts";
import { isMediaPrepareJob } from "#lib/server/jobs/predicates.ts";
import type {
  StudioDerivative,
  StudioPreparation,
  StudioProject,
  StudioRun,
  StudioStatus,
} from "#lib/shared/studio-data.ts";

const JOB_PROGRESS = {
  progress: jobs.progress,
  progressMessage: jobs.progressMessage,
  error: jobs.error,
};

// Rows written within one millisecond keep their insertion order.
const NEWEST_FIRST = [desc(sql`created_at`), desc(sql`rowid`)];

export function studioProject(
  executor: Executor,
  projectId: string,
): StudioProject | null {
  const row = executor
    .select({
      id: projects.id,
      name: projects.name,
      createdAt: projects.createdAt,
      workspaceName: workspaces.name,
      mediaFilename: projects.mediaFilename,
      mediaOriginalKey: projects.mediaOriginalKey,
      mediaType: mediaUploads.mediaType,
      uploadStatus: mediaUploads.status,
      sizeBytes: mediaUploads.sizeBytes,
      mediaDurationUs: projects.mediaDurationUs,
      mediaPreparationStatus: projects.mediaPreparationStatus,
      mediaProbe: projects.mediaProbe,
      mediaFrameRateNum: projects.mediaFrameRateNum,
      mediaFrameRateDen: projects.mediaFrameRateDen,
      mediaSeekable: projects.mediaSeekable,
      mediaProxyRecommended: projects.mediaProxyRecommended,
    })
    .from(projects)
    .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
    .leftJoin(mediaUploads, eq(mediaUploads.projectId, projects.id))
    .where(eq(projects.id, projectId))
    .get();
  if (!row) return null;
  const { mediaOriginalKey, ...project } = row;
  return { ...project, hasSourceMedia: Boolean(mediaOriginalKey) };
}

export function latestRun(
  executor: Executor,
  projectId: string,
): StudioRun | null {
  const run = executor
    .select({
      id: transcriptionRuns.id,
      status: transcriptionRuns.status,
      adapterId: transcriptionRuns.adapterId,
      modelId: transcriptionRuns.modelId,
    })
    .from(transcriptionRuns)
    .where(eq(transcriptionRuns.projectId, projectId))
    .orderBy(...NEWEST_FIRST)
    .limit(1)
    .get();
  if (!run) return null;
  const job = executor
    .select({ jobState: jobs.state, ...JOB_PROGRESS })
    .from(jobs)
    .where(eq(jobs.runId, run.id))
    .orderBy(...NEWEST_FIRST)
    .limit(1)
    .get();
  return {
    ...run,
    jobState: job?.jobState ?? null,
    progress: job?.progress ?? null,
    progressMessage: job?.progressMessage ?? null,
    error: job?.error ?? null,
  };
}

export function latestMediaPreparation(
  executor: Executor,
  projectId: string,
): StudioPreparation | null {
  const job = executor
    .select({ state: jobs.state, ...JOB_PROGRESS })
    .from(jobs)
    .where(and(eq(jobs.projectId, projectId), isMediaPrepareJob))
    .orderBy(...NEWEST_FIRST)
    .limit(1)
    .get();
  return job ?? null;
}

export function studioStatus(
  executor: Executor,
  projectId: string,
): StudioStatus {
  return {
    run: latestRun(executor, projectId),
    preparation: latestMediaPreparation(executor, projectId),
  };
}

export function readyDerivatives(
  executor: Executor,
  projectId: string,
): StudioDerivative[] {
  return executor
    .select({
      kind: mediaDerivatives.kind,
      mediaType: mediaDerivatives.mediaType,
      sizeBytes: mediaDerivatives.sizeBytes,
      metadata: mediaDerivatives.metadata,
    })
    .from(mediaDerivatives)
    .where(
      and(
        eq(mediaDerivatives.projectId, projectId),
        eq(mediaDerivatives.status, "ready"),
      ),
    )
    .orderBy(asc(mediaDerivatives.kind))
    .all();
}
