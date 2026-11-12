import { rm } from "node:fs/promises";

import { eq } from "drizzle-orm";

import { jobs, mediaUploads, projects } from "#lib/server/db/schema.ts";
import { withTransaction } from "#lib/server/db/transaction.ts";
import { manageableProjectForUser } from "#lib/server/projects/access.ts";
import {
  projectStoragePath,
  stagedUploadMetadataPath,
  stagedUploadPath,
  workerArtifactsPath,
} from "#lib/server/storage/paths.ts";

export async function deleteProjectForUser(
  projectId: string,
  userId: string,
): Promise<boolean> {
  const deleted = withTransaction((tx) => {
    const project = manageableProjectForUser(tx, projectId, userId);
    if (!project) return null;
    const jobIds = tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.projectId, projectId))
      .all()
      .map((job) => job.id);
    const upload = tx
      .select({ id: mediaUploads.id })
      .from(mediaUploads)
      .where(eq(mediaUploads.projectId, projectId))
      .get();
    tx.delete(projects).where(eq(projects.id, projectId)).run();
    return {
      workspaceId: project.workspaceId,
      uploadId: upload?.id ?? null,
      jobIds,
    };
  });
  if (!deleted) return false;
  const { workspaceId, uploadId, jobIds } = deleted;

  const paths = [
    projectStoragePath(workspaceId, projectId),
    ...(uploadId
      ? [stagedUploadPath(uploadId), stagedUploadMetadataPath(uploadId)]
      : []),
    ...jobIds.map(workerArtifactsPath),
  ];
  await Promise.all(
    paths.map((path) =>
      rm(path, { recursive: true, force: true }).catch((cause) => {
        console.warn(
          `Could not remove deleted project storage at ${path}`,
          cause,
        );
      }),
    ),
  );
  return true;
}
