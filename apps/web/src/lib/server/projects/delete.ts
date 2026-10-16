import { rm } from "node:fs/promises";

import { lockForTransaction, lockKeys } from "$lib/server/db/locks";
import { withTransaction } from "$lib/server/db/transaction";
import { manageableProjectForUser } from "$lib/server/projects/access";
import {
  projectStoragePath,
  stagedUploadMetadataPath,
  stagedUploadPath,
  workerArtifactsPath,
} from "$lib/server/storage/paths";

// Authorization runs before any lock so an outsider never waits behind, or
// holds up, work on a project they cannot touch. The lock order then matches
// media preparation: advisory lock, jobs, project.
export async function deleteProjectForUser(
  projectId: string,
  userId: string,
): Promise<boolean> {
  const deleted = await withTransaction(async (client) => {
    const project = await manageableProjectForUser(client, projectId, userId);
    if (!project) return null;

    await lockForTransaction(client, lockKeys.projectMedia(projectId));
    const jobs = await client.query<{ id: string }>(
      `select id from jobs where project_id = $1 for update`,
      [projectId],
    );
    const locked = await client.query<{ upload_id: string | null }>(
      `select upload.id as upload_id
         from projects p
         left join media_uploads upload on upload.project_id = p.id
        where p.id = $1
        for update of p`,
      [projectId],
    );
    if (!locked.rows[0]) return null;
    await client.query("delete from projects where id = $1", [projectId]);
    return {
      workspaceId: project.workspaceId,
      uploadId: locked.rows[0].upload_id,
      jobIds: jobs.rows.map((job) => job.id),
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
