import type { MediaPreparationJobPayload } from "@anysub/contracts";
import type { PoolClient } from "pg";

import { lockForTransaction, lockKeys } from "$lib/server/db/locks";
import { withTransaction } from "$lib/server/db/transaction";
import { cleanupStagedMediaArtifacts } from "$lib/server/media/artifact-staging";

export async function enqueueMediaPreparation(
  client: PoolClient,
  input: {
    workspaceId: string;
    projectId: string;
    sourceStorageKey: string;
    sourceFilename: string;
    sourceMediaType: string | null;
  },
): Promise<string> {
  await lockForTransaction(client, lockKeys.projectMedia(input.projectId));
  const project = await client.query<{ media_original_key: string | null }>(
    "select media_original_key from projects where id = $1 for update",
    [input.projectId],
  );
  if (
    !project.rows[0] ||
    project.rows[0].media_original_key !== input.sourceStorageKey
  ) {
    throw new Error("Project source changed before media preparation queued.");
  }
  const existing = await client.query<{ id: string }>(
    `select id
       from jobs
      where kind = 'media_prepare'
        and project_id = $1
        and state in ('queued', 'leased')
      order by created_at desc
      limit 1`,
    [input.projectId],
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const payload: MediaPreparationJobPayload = {
    kind: "media_prepare",
    projectId: input.projectId,
    sourceStorageKey: input.sourceStorageKey,
    sourceFilename: input.sourceFilename,
    ...(input.sourceMediaType
      ? { sourceMediaType: input.sourceMediaType }
      : {}),
  };
  const job = await client.query<{ id: string }>(
    `insert into jobs (workspace_id, project_id, kind, payload)
     values ($1, $2, 'media_prepare', $3)
     returning id`,
    [input.workspaceId, input.projectId, JSON.stringify(payload)],
  );
  await client.query(
    `update projects
        set media_preparation_status = 'queued', updated_at = now()
      where id = $1`,
    [input.projectId],
  );
  return job.rows[0].id;
}

export async function requestMediaPreparationForUser(
  projectId: string,
  userId: string,
): Promise<boolean> {
  return withTransaction(async (client) => {
    const project = await client.query<{
      workspace_id: string;
      media_original_key: string;
      media_filename: string;
      media_type: string | null;
    }>(
      `select p.workspace_id, p.media_original_key, p.media_filename,
              upload.media_type
         from projects p
         join memberships m on m.workspace_id = p.workspace_id
         left join media_uploads upload on upload.project_id = p.id
        where p.id = $1 and m.user_id = $2
          and p.media_original_key is not null
        `,
      [projectId, userId],
    );
    const row = project.rows[0];
    if (!row) return false;
    await enqueueMediaPreparation(client, {
      workspaceId: row.workspace_id,
      projectId,
      sourceStorageKey: row.media_original_key,
      sourceFilename: row.media_filename,
      sourceMediaType: row.media_type,
    });
    return true;
  });
}

export async function cancelMediaPreparationForUser(
  projectId: string,
  userId: string,
): Promise<boolean> {
  const jobId = await withTransaction(async (client) => {
    const active = await client.query<{ id: string; prepared: boolean }>(
      `select j.id, (p.media_probe is not null) as prepared
         from jobs j
         join projects p on p.id = j.project_id
         join memberships m on m.workspace_id = p.workspace_id
        where j.kind = 'media_prepare'
          and j.project_id = $1
          and j.state in ('queued', 'leased')
          and m.user_id = $2
        order by j.created_at desc
        limit 1
        for update of j, p`,
      [projectId, userId],
    );
    const job = active.rows[0];
    if (!job) return null;
    await client.query(
      `update jobs
          set state = 'cancelled', lease_token_hash = null,
              lease_expires_at = null, progress_message = 'Cancelled',
              updated_at = now()
        where id = $1`,
      [job.id],
    );
    await client.query(
      `update projects
          set media_preparation_status = $2, updated_at = now()
        where id = $1`,
      [projectId, job.prepared ? "completed" : "not_started"],
    );
    return job.id;
  });
  if (!jobId) return false;
  await cleanupStagedMediaArtifacts(jobId);
  return true;
}
