import { rm } from "node:fs/promises";
import { posix } from "node:path";

import { withTransaction } from "$lib/server/db/transaction";
import { lockForTransaction, lockKeys } from "$lib/server/db/locks";
import { resolveDataPath } from "$lib/server/storage/paths";

export async function deleteProjectForUser(
  projectId: string,
  userId: string,
): Promise<boolean> {
  const deleted = await withTransaction(async (client) => {
    await lockForTransaction(client, lockKeys.projectMedia(projectId));
    const jobIds = (
      await client.query<{ id: string }>(
        `select id
           from jobs
          where project_id = $1
          for update`,
        [projectId],
      )
    ).rows.map((job) => job.id);
    const project = await client.query<{
      workspace_id: string;
      upload_id: string | null;
    }>(
      `select p.workspace_id, upload.id as upload_id
         from projects p
         join memberships m on m.workspace_id = p.workspace_id
         left join media_uploads upload on upload.project_id = p.id
        where p.id = $1 and m.user_id = $2
          and (p.created_by = $2 or m.role in ('owner', 'admin'))
        for update of p`,
      [projectId, userId],
    );
    if (!project.rows[0]) return null;
    await client.query("delete from projects where id = $1", [projectId]);
    return {
      workspaceId: project.rows[0].workspace_id,
      uploadId: project.rows[0].upload_id,
      jobIds,
    };
  });
  if (!deleted) return false;
  const { workspaceId, uploadId, jobIds } = deleted;

  const paths = [
    resolveDataPath(
      posix.join("workspaces", workspaceId, "projects", projectId),
    ),
    ...(uploadId
      ? [
          resolveDataPath(posix.join("staging", "uploads", uploadId)),
          resolveDataPath(posix.join("staging", "uploads", `${uploadId}.json`)),
        ]
      : []),
    ...jobIds.map((jobId) =>
      resolveDataPath(posix.join("staging", "worker-artifacts", jobId)),
    ),
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
