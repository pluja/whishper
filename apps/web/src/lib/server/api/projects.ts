import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import { and, desc, eq, lt, or, asc } from "drizzle-orm";

import type {
  ApiMe,
  ApiProject,
  ApiProjectList,
  ApiProjectSummary,
} from "#lib/server/api/schemas.ts";
import { trackSummaries } from "#lib/server/api/tracks.ts";
import { latestTranscription } from "#lib/server/api/transcriptions.ts";
import { db, type Executor } from "#lib/server/db/index.ts";
import { memberships, projects, workspaces } from "#lib/server/db/schema.ts";
import { badRequest, notFound, StatusError } from "#lib/server/http/errors.ts";
import { requireMemberProject } from "#lib/server/projects/access.ts";
import { deleteProjectForUser } from "#lib/server/projects/delete.ts";
import { primaryWorkspaceForUser } from "#lib/server/projects/library.ts";
import {
  latestMediaPreparation,
  studioProject,
} from "#lib/server/projects/studio.ts";
import { readInstanceSettings } from "#lib/server/settings/instance.ts";
import { stagedUploadPath } from "#lib/server/storage/paths.ts";
import {
  completeUpload,
  createUploadProject,
  deleteUnfinishedUploadProject,
} from "#lib/server/uploads/projects.ts";
import { normalizeMediaType } from "#lib/shared/media.ts";
import {
  UPLOAD_STATUSES,
  type UploadStatus,
} from "#lib/shared/project-status.ts";

export function workspacesForUser(userId: string): ApiMe["workspaces"] {
  return db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(eq(memberships.userId, userId))
    .orderBy(asc(workspaces.createdAt))
    .all();
}

// Covers every workspace the user belongs to, newest first. The cursor holds
// the last project's creation time and ID, so pages stay stable while new
// projects arrive.
export function listProjects(
  userId: string,
  { limit, cursor }: { limit: number; cursor?: string },
): ApiProjectList {
  const after = cursor ? decodeCursor(cursor) : null;
  const rows = db
    .select({
      id: projects.id,
      workspaceId: projects.workspaceId,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .innerJoin(memberships, eq(memberships.workspaceId, projects.workspaceId))
    .where(
      and(
        eq(memberships.userId, userId),
        after
          ? or(
              lt(projects.createdAt, after.createdAt),
              and(
                eq(projects.createdAt, after.createdAt),
                lt(projects.id, after.id),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(projects.createdAt), desc(projects.id))
    .limit(limit + 1)
    .all();
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    projects: page.flatMap(
      (row) => projectSummary(db, row.id, row.workspaceId) ?? [],
    ),
    nextCursor:
      rows.length > limit && last
        ? encodeCursor(last.createdAt, last.id)
        : null,
  };
}

export function projectForApi(userId: string, projectId: string): ApiProject {
  const { workspaceId } = requireMemberProject(db, projectId, userId);
  const summary = projectSummary(db, projectId, workspaceId);
  if (!summary) throw notFound("Project not found.");
  return { ...summary, tracks: trackSummaries(db, projectId) };
}

export async function deleteProjectForApi(
  userId: string,
  projectId: string,
): Promise<void> {
  requireMemberProject(db, projectId, userId);
  if (!(await deleteProjectForUser(projectId, userId))) {
    throw new StatusError(
      403,
      "Only the project's creator or a workspace owner or admin can delete it.",
    );
  }
}

// Takes the file as the raw request body and runs it through the same steps
// as a browser upload. Bodies above the server's request limit never arrive;
// those files use the resumable upload instead.
export async function createProjectFromBody(
  userId: string,
  request: Request,
  query: { filename: string; name?: string; workspaceId?: string },
): Promise<ApiProject> {
  const sizeBytes = Number(request.headers.get("content-length"));
  if (!request.body || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    throw badRequest(
      "Send the file as the request body, with its Content-Length.",
    );
  }
  const { maxUploadBytes } = readInstanceSettings();
  if (sizeBytes > maxUploadBytes) {
    throw new StatusError(413, "The file is larger than the upload limit.");
  }
  const workspaceId =
    query.workspaceId ?? primaryWorkspaceForUser(db, userId)?.id;
  if (!workspaceId) throw notFound("Workspace not found.");

  const uploadId = randomUUID();
  const projectId = createUploadProject({
    uploadId,
    workspaceId,
    userId,
    filename: query.filename,
    projectName: query.name ?? null,
    mediaType: declaredMediaType(request.headers.get("content-type")),
    sizeBytes,
  });
  const stagingPath = stagedUploadPath(uploadId);
  try {
    await mkdir(dirname(stagingPath), { recursive: true });
    await writeExactly(request.body, stagingPath, sizeBytes);
    await completeUpload(uploadId, userId);
  } catch (cause) {
    deleteUnfinishedUploadProject(projectId);
    await unlink(stagingPath).catch(() => undefined);
    throw cause;
  }
  return projectForApi(userId, projectId);
}

function projectSummary(
  executor: Executor,
  projectId: string,
  workspaceId: string,
): ApiProjectSummary | null {
  const project = studioProject(executor, projectId);
  if (!project) return null;
  const preparation = latestMediaPreparation(executor, projectId);
  return {
    id: project.id,
    workspaceId,
    name: project.name,
    sourceFilename: project.mediaFilename,
    durationUs: project.mediaDurationUs,
    createdAt: project.createdAt.toISOString(),
    media: {
      upload: uploadStatus(project.uploadStatus),
      preparation: project.mediaPreparationStatus,
      error:
        project.mediaPreparationStatus === "failed" &&
        typeof preparation?.error?.message === "string"
          ? preparation.error.message
          : null,
    },
    latestTranscription: latestTranscription(executor, projectId),
  };
}

function uploadStatus(value: string | null): UploadStatus | null {
  return UPLOAD_STATUSES.find((status) => status === value) ?? null;
}

// An absent or generic type is fine: the media probe decides what the file
// is. A declared type must still be audio or video.
function declaredMediaType(contentType: string | null): string | null {
  const declared = contentType?.split(";")[0]?.trim();
  if (!declared || declared === "application/octet-stream") return null;
  const mediaType = normalizeMediaType(declared);
  if (!mediaType) {
    throw badRequest("Only audio and video uploads are supported.");
  }
  return mediaType;
}

async function writeExactly(
  body: ReadableStream<Uint8Array>,
  path: string,
  expectedBytes: number,
): Promise<void> {
  let received = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received > expectedBytes) {
        callback(badRequest("The body is longer than its Content-Length."));
        return;
      }
      callback(null, chunk);
    },
  });
  await pipeline(
    Readable.fromWeb(body as import("node:stream/web").ReadableStream),
    counter,
    createWriteStream(path),
  );
  if (received !== expectedBytes) {
    throw badRequest("The body ended before its Content-Length.");
  }
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.getTime()}.${id}`).toString("base64url");
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  const [time, id] = Buffer.from(cursor, "base64url")
    .toString("utf8")
    .split(".");
  const createdAt = new Date(Number(time));
  if (!id || Number.isNaN(createdAt.getTime())) {
    throw badRequest("cursor: Use the nextCursor from the previous page.");
  }
  return { createdAt, id };
}
