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

// The unlocked check keeps an outsider from waiting behind, or holding up,
// work on a project they cannot touch. Media preparation also starts with the
// advisory lock, which serializes the two; the check then repeats under the
// project row lock in case access was revoked while waiting.
export async function deleteProjectForUser(
  projectId: string,
  userId: string,
): Promise<boolean> {
  const deleted = await withTransaction(async (client) => {
    if (!(await manageableProjectForUser(client, projectId, userId))) {
      return null;
    }

    await lockForTransaction(client, lockKeys.projectMedia(projectId));
    const jobs = await client.query<{ id: string }>(
      `select id from jobs where project_id = $1 for update`,
      [projectId],
    );
    const project = await manageableProjectForUser(client, projectId, userId, {
      lock: true,
    });
    if (!project) return null;
    const upload = await client.query<{ id: string }>(
      `select id from media_uploads where project_id = $1`,
      [projectId],
    );
    await client.query("delete from projects where id = $1", [projectId]);
    return {
      workspaceId: project.workspaceId,
      uploadId: upload.rows[0]?.id ?? null,
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
