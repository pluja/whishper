import { mkdir, unlink } from "node:fs/promises";
import { basename, dirname, extname } from "node:path";

import { and, eq, isNull, ne, sql } from "drizzle-orm";

import { db } from "$lib/server/db";
import { mediaUploads, memberships, projects } from "$lib/server/db/schema";
import { withTransaction } from "$lib/server/db/transaction";
import { badRequest, notFound } from "$lib/server/http/errors";
import { enqueueMediaPreparation } from "$lib/server/media/preparation";
import { normalizeProjectTitle } from "$lib/server/projects/library";
import { linkIdempotent } from "$lib/server/storage/files";
import { withKeyedLock } from "$lib/server/storage/keyed-lock";
import {
  originalStorageKey,
  resolveDataPath,
  stagedUploadPath,
} from "$lib/server/storage/paths";
import { truncateText } from "$lib/shared/format";
import { PROJECT_TITLE_MAX_LENGTH } from "$lib/shared/limits";

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
  return truncateText(stem.trim() || filename, PROJECT_TITLE_MAX_LENGTH);
}

export function createUploadProject(input: {
  uploadId: string;
  workspaceId: string;
  userId: string;
  filename: string;
  mediaType: string | null;
  projectName?: string | null;
  sizeBytes: number;
}): string {
  if (!SAFE_ID.test(input.uploadId)) throw badRequest("Invalid upload ID.");
  const filename = normalizeFilename(input.filename);
  return withTransaction((tx) => {
    const membership = tx
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(
        and(
          eq(memberships.workspaceId, input.workspaceId),
          eq(memberships.userId, input.userId),
        ),
      )
      .get();
    if (!membership) throw notFound("Workspace not found.");
    const project = tx
      .insert(projects)
      .values({
        workspaceId: input.workspaceId,
        name: projectNameFor(filename, input.projectName),
        mediaFilename: filename,
        createdBy: input.userId,
      })
      .returning({ id: projects.id })
      .get();
    tx.insert(mediaUploads)
      .values({
        id: input.uploadId,
        workspaceId: input.workspaceId,
        projectId: project.id,
        createdBy: input.userId,
        originalFilename: filename,
        mediaType: input.mediaType,
        sizeBytes: input.sizeBytes,
      })
      .run();
    return project.id;
  });
}

export function requireOwnedUpload(
  uploadId: string,
  userId: string,
): UploadProject {
  const upload = db
    .select({
      projectId: mediaUploads.projectId,
      workspaceId: mediaUploads.workspaceId,
      originalFilename: mediaUploads.originalFilename,
      mediaType: mediaUploads.mediaType,
      storageKey: mediaUploads.storageKey,
      status: mediaUploads.status,
    })
    .from(mediaUploads)
    .where(
      and(eq(mediaUploads.id, uploadId), eq(mediaUploads.createdBy, userId)),
    )
    .get();
  if (!upload) throw notFound("Upload not found.");
  return upload;
}

export function uploadMediaType(projectId: string): string | null {
  return (
    db
      .select({ mediaType: mediaUploads.mediaType })
      .from(mediaUploads)
      .where(eq(mediaUploads.projectId, projectId))
      .get()?.mediaType ?? null
  );
}

export function updateUploadProgress(
  uploadId: string,
  receivedBytes: number,
): void {
  db.update(mediaUploads)
    .set({
      receivedBytes: sql`min(${mediaUploads.sizeBytes}, ${receivedBytes})`,
    })
    .where(
      and(eq(mediaUploads.id, uploadId), eq(mediaUploads.status, "uploading")),
    )
    .run();
}

// The lock keeps a retried finalization from linking or recording the file
// while the first attempt is still at it.
export async function completeUpload(
  uploadId: string,
  userId: string,
): Promise<{ projectId: string; storageKey: string }> {
  return withKeyedLock(`upload:${uploadId}`, async () => {
    const upload = requireOwnedUpload(uploadId, userId);
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
    const notCompleted = and(
      eq(mediaUploads.id, uploadId),
      ne(mediaUploads.status, "completed"),
    );
    db.update(mediaUploads)
      .set({
        status: "finalizing",
        error: null,
        firstFinalizeAttemptAt: sql`coalesce(${mediaUploads.firstFinalizeAttemptAt}, ${Date.now()})`,
      })
      .where(notCompleted)
      .run();

    let linked = false;
    try {
      await mkdir(dirname(canonicalPath), { recursive: true });
      linked = await linkIdempotent(stagingPath, canonicalPath);

      withTransaction((tx) => {
        tx.update(projects)
          .set({
            mediaOriginalKey: storageKey,
            mediaFilename: upload.originalFilename,
          })
          .where(eq(projects.id, upload.projectId))
          .run();
        tx.update(mediaUploads)
          .set({
            status: "completed",
            storageKey,
            receivedBytes: sql`${mediaUploads.sizeBytes}`,
            completedAt: new Date(),
          })
          .where(eq(mediaUploads.id, uploadId))
          .run();
        enqueueMediaPreparation(tx, {
          workspaceId: upload.workspaceId,
          projectId: upload.projectId,
          sourceStorageKey: storageKey,
        });
      });
    } catch (cause) {
      if (linked) await unlink(canonicalPath).catch(() => undefined);
      try {
        db.update(mediaUploads)
          .set({
            status: "uploading",
            error:
              cause instanceof Error ? cause.message : "Finalization failed.",
          })
          .where(notCompleted)
          .run();
      } catch {
        // The original failure is the one worth reporting.
      }
      throw cause;
    }

    await unlink(stagingPath).catch(() => undefined);
    return { projectId: upload.projectId, storageKey };
  });
}

export function cancelUpload(uploadId: string, userId: string): void {
  let upload: UploadProject;
  try {
    upload = requireOwnedUpload(uploadId, userId);
  } catch {
    return;
  }
  if (upload.status === "completed") return;
  deleteUnfinishedUploadProject(upload.projectId);
}

export function deleteUnfinishedUploadProject(projectId: string): void {
  db.delete(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.mediaOriginalKey)))
    .run();
}
