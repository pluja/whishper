import type { MediaPreparationJobPayload } from "@anysub/contracts";
import type { PoolClient } from "pg";

import { lockForTransaction, lockKeys } from "$lib/server/db/locks";
import { withTransaction } from "$lib/server/db/transaction";
import {
  IS_ACTIVE_JOB,
  IS_MEDIA_PREPARE_JOB,
} from "$lib/server/jobs/predicates";
import { cleanupStagedMediaArtifacts } from "$lib/server/media/artifact-staging";
import { projectForUser } from "$lib/server/projects/access";

// The payload is built from the locked project row, so it always describes
// the source the job will read.
export async function enqueueMediaPreparation(
  client: PoolClient,
  input: { workspaceId: string; projectId: string; sourceStorageKey: string },
): Promise<string> {
  await lockForTransaction(client, lockKeys.projectMedia(input.projectId));
  const project = await client.query<{
    storageKey: string | null;
    filename: string | null;
    mediaType: string | null;
  }>(
    `select p.media_original_key as "storageKey",
            p.media_filename as filename,
            upload.media_type as "mediaType"
       from projects p
       left join media_uploads upload on upload.project_id = p.id
      where p.id = $1
      for update of p`,
    [input.projectId],
  );
  const source = project.rows[0];
  if (
    !source ||
    source.storageKey !== input.sourceStorageKey ||
    source.filename === null
  ) {
    throw new Error("Project source changed before media preparation queued.");
  }
  const existing = await client.query<{ id: string }>(
    `select id
       from jobs
      where project_id = $1
        and ${IS_MEDIA_PREPARE_JOB}
        and ${IS_ACTIVE_JOB}
      order by created_at desc
      limit 1`,
    [input.projectId],
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const payload: MediaPreparationJobPayload = {
    kind: "media_prepare",
    projectId: input.projectId,
    sourceStorageKey: input.sourceStorageKey,
    sourceFilename: source.filename,
    ...(source.mediaType ? { sourceMediaType: source.mediaType } : {}),
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
    const project = await projectForUser(client, projectId, userId);
    if (!project?.mediaOriginalKey) return false;
    await enqueueMediaPreparation(client, {
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
  const jobId = await withTransaction(async (client) => {
    if (!(await projectForUser(client, projectId, userId))) return null;
    const active = await client.query<{ id: string; prepared: boolean }>(
      `select j.id, (p.media_probe is not null) as prepared
         from jobs j
         join projects p on p.id = j.project_id
        where j.project_id = $1
          and ${IS_MEDIA_PREPARE_JOB}
          and ${IS_ACTIVE_JOB}
        order by j.created_at desc
        limit 1
        for update of j, p`,
      [projectId],
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
