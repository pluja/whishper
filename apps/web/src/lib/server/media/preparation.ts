import type { MediaPreparationJobPayload } from "@anysub/contracts";
import { and, desc, eq } from "drizzle-orm";

import type { Executor } from "$lib/server/db";
import { jobs, mediaUploads, projects } from "$lib/server/db/schema";
import { withTransaction } from "$lib/server/db/transaction";
import { isActiveJob, isMediaPrepareJob } from "$lib/server/jobs/predicates";
import { cancelActiveJobs } from "$lib/server/jobs/release";
import { cleanupStagedMediaArtifacts } from "$lib/server/media/artifact-staging";
import { projectForUser } from "$lib/server/projects/access";

// The payload is built from the project row read in the same transaction, so
// it always describes the source the job will read.
export function enqueueMediaPreparation(
  tx: Executor,
  input: { workspaceId: string; projectId: string; sourceStorageKey: string },
): string {
  const source = tx
    .select({
      storageKey: projects.mediaOriginalKey,
      filename: projects.mediaFilename,
      mediaType: mediaUploads.mediaType,
    })
    .from(projects)
    .leftJoin(mediaUploads, eq(mediaUploads.projectId, projects.id))
    .where(eq(projects.id, input.projectId))
    .get();
  if (
    !source ||
    source.storageKey !== input.sourceStorageKey ||
    source.filename === null
  ) {
    throw new Error("Project source changed before media preparation queued.");
  }
  const existing = tx
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(eq(jobs.projectId, input.projectId), isMediaPrepareJob, isActiveJob),
    )
    .orderBy(desc(jobs.createdAt))
    .limit(1)
    .get();
  if (existing) return existing.id;

  const payload: MediaPreparationJobPayload = {
    kind: "media_prepare",
    projectId: input.projectId,
    sourceStorageKey: input.sourceStorageKey,
    sourceFilename: source.filename,
    ...(source.mediaType ? { sourceMediaType: source.mediaType } : {}),
  };
  const job = tx
    .insert(jobs)
    .values({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      kind: "media_prepare",
      payload,
    })
    .returning({ id: jobs.id })
    .get();
  tx.update(projects)
    .set({ mediaPreparationStatus: "queued" })
    .where(eq(projects.id, input.projectId))
    .run();
  return job.id;
}

export function requestMediaPreparationForUser(
  projectId: string,
  userId: string,
): boolean {
  return withTransaction((tx) => {
    const project = projectForUser(tx, projectId, userId);
    if (!project?.mediaOriginalKey) return false;
    enqueueMediaPreparation(tx, {
      workspaceId: project.workspaceId,
      projectId,
      sourceStorageKey: project.mediaOriginalKey,
    });
    return true;
  });
}

export async function cancelMediaPreparationForUser(
  projectId: string,
  userId: string,
): Promise<boolean> {
  const jobId = withTransaction((tx) => {
    if (!projectForUser(tx, projectId, userId)) return null;
    const job = tx
      .select({ id: jobs.id, probe: projects.mediaProbe })
      .from(jobs)
      .innerJoin(projects, eq(projects.id, jobs.projectId))
      .where(and(eq(jobs.projectId, projectId), isMediaPrepareJob, isActiveJob))
      .orderBy(desc(jobs.createdAt))
      .limit(1)
      .get();
    if (!job) return null;
    cancelActiveJobs(tx, eq(jobs.id, job.id));
    tx.update(projects)
      .set({
        mediaPreparationStatus:
          job.probe === null ? "not_started" : "completed",
      })
      .where(eq(projects.id, projectId))
      .run();
    return job.id;
  });
  if (!jobId) return false;
  await cleanupStagedMediaArtifacts(jobId);
  return true;
}
