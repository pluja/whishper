import { mkdir, unlink } from "node:fs/promises";
import { basename, dirname, extname } from "node:path";

import { pool } from "$lib/server/db";
import { lockForTransaction, lockKeys } from "$lib/server/db/locks";
import { withTransaction } from "$lib/server/db/transaction";
import { badRequest, notFound } from "$lib/server/http/errors";
import { enqueueMediaPreparation } from "$lib/server/media/preparation";
import { normalizeProjectTitle } from "$lib/server/projects/library";
import { linkIdempotent } from "$lib/server/storage/files";
import {
  originalStorageKey,
  resolveDataPath,
  stagedUploadPath,
} from "$lib/server/storage/paths";
import { PROJECT_TITLE_MAX_LENGTH } from "$lib/shared/project-limits";

const SAFE_ID = /^[a-zA-Z0-9_-]{1,128}$/;

export type UploadProject = {
  projectId: string;
  workspaceId: string;
  originalFilename: string;
  mediaType: string | null;
  storageKey: string | null;
  status: string;
};

export function normalizeFilename(value: string): string {
  const leaf = basename(value.replaceAll("\\", "/"))
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, "_")
    .trim();
  if (!leaf || leaf === "." || leaf === "..") {
    throw badRequest("A valid filename is required.");
  }
  return leaf.slice(0, 255);
}

export function projectNameFor(
  filename: string,
  requestedName?: string | null,
): string {
  const normalizedName = normalizeProjectTitle(requestedName ?? null);
  if (normalizedName) return normalizedName;
  const extension = extname(filename);
  const stem = filename.slice(
    0,
    Math.max(0, filename.length - extension.length),
  );
  return (stem.trim() || filename).slice(0, PROJECT_TITLE_MAX_LENGTH);
}

export async function createUploadProject(input: {
  uploadId: string;
  workspaceId: string;
  userId: string;
  filename: string;
  mediaType: string | null;
  projectName?: string | null;
  sizeBytes: number;
}): Promise<string> {
  if (!SAFE_ID.test(input.uploadId)) throw badRequest("Invalid upload ID.");
  const filename = normalizeFilename(input.filename);
  return withTransaction(async (client) => {
    const membership = await client.query(
      `select 1 from memberships where workspace_id = $1 and user_id = $2`,
      [input.workspaceId, input.userId],
    );
    if (membership.rowCount !== 1) {
      throw notFound("Workspace not found.");
    }
    const project = await client.query<{ id: string }>(
      `insert into projects (workspace_id, name, media_filename, created_by)
       values ($1, $2, $3, $4)
       returning id`,
      [
        input.workspaceId,
        projectNameFor(filename, input.projectName),
        filename,
        input.userId,
      ],
    );
    await client.query(
      `insert into media_uploads
        (id, workspace_id, project_id, created_by, original_filename, media_type, size_bytes)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.uploadId,
        input.workspaceId,
        project.rows[0].id,
        input.userId,
        filename,
        input.mediaType,
        input.sizeBytes,
      ],
    );
    return project.rows[0].id;
  });
}

export async function requireOwnedUpload(
  uploadId: string,
  userId: string,
): Promise<UploadProject> {
  const result = await pool.query<UploadProject>(
    `select project_id as "projectId", workspace_id as "workspaceId",
            original_filename as "originalFilename", media_type as "mediaType",
            storage_key as "storageKey", status
       from media_uploads where id = $1 and created_by = $2`,
    [uploadId, userId],
  );
  const upload = result.rows[0];
  if (!upload) {
    throw notFound("Upload not found.");
  }
  return upload;
}

export async function updateUploadProgress(
  uploadId: string,
  receivedBytes: number,
): Promise<void> {
  await pool.query(
    `update media_uploads
        set received_bytes = least(size_bytes, $2), updated_at = now()
      where id = $1 and status = 'uploading'`,
    [uploadId, receivedBytes],
  );
}

export async function completeUpload(
  uploadId: string,
  userId: string,
): Promise<{ projectId: string; storageKey: string }> {
  const upload = await requireOwnedUpload(uploadId, userId);
  if (upload.status === "completed" && upload.storageKey) {
    return { projectId: upload.projectId, storageKey: upload.storageKey };
  }

  const storageKey = originalStorageKey(
    upload.workspaceId,
    upload.projectId,
    upload.originalFilename,
  );
  const stagingPath = stagedUploadPath(uploadId);
  const canonicalPath = resolveDataPath(storageKey);
  await pool.query(
    `update media_uploads
        set status = 'finalizing', error = null, updated_at = now(),
            first_finalize_attempt_at = coalesce(first_finalize_attempt_at, now())
      where id = $1 and status <> 'completed'`,
    [uploadId],
  );

  let linked = false;
  try {
    await mkdir(dirname(canonicalPath), { recursive: true });
    linked = await linkIdempotent(stagingPath, canonicalPath);

    await withTransaction(async (client) => {
      await lockForTransaction(client, lockKeys.projectMedia(upload.projectId));
      await client.query(
        `update projects
            set media_original_key = $2, media_filename = $3, updated_at = now()
          where id = $1`,
        [upload.projectId, storageKey, upload.originalFilename],
      );
      await client.query(
        `update media_uploads
            set status = 'completed', storage_key = $2, received_bytes = size_bytes,
                completed_at = now(), updated_at = now()
          where id = $1`,
        [uploadId, storageKey],
      );
      await enqueueMediaPreparation(client, {
        workspaceId: upload.workspaceId,
        projectId: upload.projectId,
        sourceStorageKey: storageKey,
        sourceFilename: upload.originalFilename,
        sourceMediaType: upload.mediaType,
      });
    });
  } catch (cause) {
    if (linked) await unlink(canonicalPath).catch(() => undefined);
    await pool
      .query(
        `update media_uploads
            set status = 'uploading', error = $2, updated_at = now()
          where id = $1 and status <> 'completed'`,
        [
          uploadId,
          cause instanceof Error ? cause.message : "Finalization failed.",
        ],
      )
      .catch(() => undefined);
    throw cause;
  }

  await unlink(stagingPath).catch(() => undefined);
  return { projectId: upload.projectId, storageKey };
}

export async function cancelUpload(
  uploadId: string,
  userId: string,
): Promise<void> {
  const upload = await requireOwnedUpload(uploadId, userId).catch(() => null);
  if (!upload || upload.status === "completed") return;
  await deleteUnfinishedUploadProject(upload.projectId);
}

export async function deleteUnfinishedUploadProject(
  projectId: string,
): Promise<void> {
  await pool.query(
    `delete from projects where id = $1 and media_original_key is null`,
    [projectId],
  );
}
