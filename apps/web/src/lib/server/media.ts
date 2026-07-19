import { link, mkdir, stat, unlink } from "node:fs/promises";
import { basename, dirname, extname, posix, resolve, sep } from "node:path";

import { pool } from "$lib/server/db";
import { privateEnv } from "$lib/server/env";

const SAFE_ID = /^[a-zA-Z0-9_-]{1,128}$/;
const SAFE_EXTENSION = /^\.[a-zA-Z0-9]{1,12}$/;

export interface UploadProject {
  projectId: string;
  workspaceId: string;
  originalFilename: string;
  storageKey: string | null;
  status: string;
}

export function normalizeFilename(value: string): string {
  const leaf = basename(value.replaceAll("\\", "/"))
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, "_")
    .trim();
  if (!leaf || leaf === "." || leaf === "..") {
    throw new Error("A valid filename is required.");
  }
  return leaf.slice(0, 255);
}

export function projectNameFor(filename: string): string {
  const extension = extname(filename);
  const stem = filename.slice(
    0,
    Math.max(0, filename.length - extension.length),
  );
  return (stem.trim() || filename).slice(0, 160);
}

export function originalStorageKey(
  workspaceId: string,
  projectId: string,
  filename: string,
): string {
  const extension = extname(filename);
  const canonicalName = SAFE_EXTENSION.test(extension)
    ? `source${extension.toLowerCase()}`
    : "source";
  return posix.join(
    "workspaces",
    workspaceId,
    "projects",
    projectId,
    "media",
    "original",
    canonicalName,
  );
}

export function resolveDataPath(key: string): string {
  const root = resolve(privateEnv.dataRoot);
  const target = resolve(root, ...key.split("/"));
  if (!target.startsWith(`${root}${sep}`)) {
    throw new Error("Storage key escaped the data root.");
  }
  return target;
}

export async function createUploadProject(input: {
  uploadId: string;
  workspaceId: string;
  userId: string;
  filename: string;
  mediaType: string | null;
  sizeBytes: number;
}): Promise<string> {
  if (!SAFE_ID.test(input.uploadId)) throw new Error("Invalid upload ID.");
  const filename = normalizeFilename(input.filename);
  const client = await pool.connect();
  try {
    await client.query("begin");
    const membership = await client.query(
      `select 1 from memberships where workspace_id = $1 and user_id = $2`,
      [input.workspaceId, input.userId],
    );
    if (membership.rowCount !== 1) {
      throw Object.assign(new Error("Workspace not found."), {
        statusCode: 404,
      });
    }
    const project = await client.query<{ id: string }>(
      `insert into projects (workspace_id, name, media_filename, created_by)
       values ($1, $2, $3, $4)
       returning id`,
      [input.workspaceId, projectNameFor(filename), filename, input.userId],
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
    await client.query("commit");
    return project.rows[0].id;
  } catch (cause) {
    await client.query("rollback");
    throw cause;
  } finally {
    client.release();
  }
}

export async function requireOwnedUpload(
  uploadId: string,
  userId: string,
): Promise<UploadProject> {
  const result = await pool.query<UploadProject>(
    `select project_id as "projectId", workspace_id as "workspaceId",
            original_filename as "originalFilename", storage_key as "storageKey", status
       from media_uploads
      where id = $1 and created_by = $2`,
    [uploadId, userId],
  );
  const upload = result.rows[0];
  if (!upload) {
    throw Object.assign(new Error("Upload not found."), { statusCode: 404 });
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
  const stagingPath = resolveDataPath(
    posix.join("staging", "uploads", uploadId),
  );
  const canonicalPath = resolveDataPath(storageKey);
  await mkdir(dirname(canonicalPath), { recursive: true });
  await pool.query(
    `update media_uploads set status = 'finalizing', error = null, updated_at = now()
      where id = $1`,
    [uploadId],
  );

  let linked = false;
  try {
    try {
      await link(stagingPath, canonicalPath);
      linked = true;
    } catch (cause) {
      if (!isNodeError(cause, "EEXIST")) throw cause;
      const [source, destination] = await Promise.all([
        stat(stagingPath),
        stat(canonicalPath),
      ]);
      if (
        source.dev !== destination.dev ||
        source.ino !== destination.ino ||
        source.size !== destination.size
      ) {
        throw new Error("Canonical media path is already occupied.");
      }
    }

    const client = await pool.connect();
    try {
      await client.query("begin");
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
      await client.query("commit");
    } catch (cause) {
      await client.query("rollback");
      throw cause;
    } finally {
      client.release();
    }
  } catch (cause) {
    if (linked) await unlink(canonicalPath).catch(() => undefined);
    await pool
      .query(
        `update media_uploads
            set status = 'uploading', error = $2, updated_at = now()
          where id = $1`,
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
  await pool.query(
    `delete from projects where id = $1 and media_original_key is null`,
    [upload.projectId],
  );
}

function isNodeError(
  cause: unknown,
  code: string,
): cause is NodeJS.ErrnoException {
  return cause instanceof Error && "code" in cause && cause.code === code;
}
