import { FileStore } from "@tus/file-store";
import { ERRORS, EVENTS, MemoryLocker, Server, type Upload } from "@tus/server";
import { mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";

import { privateEnv } from "$lib/server/env";
import { clientFailure } from "$lib/server/http/errors";
import {
  cancelUpload,
  completeUpload,
  createUploadProject,
  requireOwnedUpload,
  updateUploadProgress,
} from "$lib/server/uploads/projects";
import { normalizeMediaType } from "$lib/shared/media";
import {
  startUploadMaintenance,
  UPLOAD_EXPIRATION_MS,
} from "$lib/server/uploads/maintenance";
import { isNodeError } from "$lib/server/guards";
import { readInstanceSettings } from "$lib/server/settings/instance";
import { uploadStagingDirectory } from "$lib/server/storage/paths";
import { isUuid } from "$lib/shared/uuid";

const TUS_PATH = "/api/uploads";
const USER_HEADER = "x-anysub-authenticated-user";

let storePromise: Promise<FileStore> | undefined;
let serverPromise: Promise<Server> | undefined;

export function isUploadPath(pathname: string): boolean {
  return pathname === TUS_PATH || pathname.startsWith(`${TUS_PATH}/`);
}

export async function handleUploadRequest(
  request: Request,
  userId: string,
): Promise<Response> {
  const headers = new Headers(request.headers);
  headers.set(USER_HEADER, userId);
  const authenticatedRequest = new Request(request, { headers });
  return (await getServer()).handleWeb(authenticatedRequest);
}

async function getServer(): Promise<Server> {
  serverPromise ??= createServer();
  return serverPromise;
}

function getStore(): Promise<FileStore> {
  storePromise ??= (async () => {
    const stagingDirectory = uploadStagingDirectory();
    await mkdir(stagingDirectory, { recursive: true });
    return new FileStore({
      directory: stagingDirectory,
      expirationPeriodInMilliseconds: UPLOAD_EXPIRATION_MS,
    });
  })();
  return storePromise;
}

function isAlreadyGone(cause: unknown): boolean {
  return cause === ERRORS.FILE_NOT_FOUND || isNodeError(cause, "ENOENT");
}

export async function removeStoredUpload(
  store: Pick<FileStore, "directory" | "configstore">,
  uploadId: string,
): Promise<void> {
  try {
    await unlink(join(store.directory, uploadId));
  } catch (cause) {
    if (!isNodeError(cause, "ENOENT")) throw cause;
  }
  await store.configstore.delete(uploadId).catch((cause) => {
    if (!isAlreadyGone(cause)) throw cause;
  });
}

async function removeTusUpload(uploadId: string): Promise<void> {
  await removeStoredUpload(await getStore(), uploadId);
}

async function finalizeTusUpload(
  uploadId: string,
  userId: string,
): Promise<{ projectId: string }> {
  const completed = await completeUpload(uploadId, userId);
  const store = await getStore();
  await store.configstore.delete(uploadId).catch((cause) => {
    console.warn("Could not remove completed tus metadata", cause);
  });
  return completed;
}

async function removeExpiredTusUploads(): Promise<void> {
  const { configstore } = await getStore();
  const cutoff = Date.now() - UPLOAD_EXPIRATION_MS;
  for (const uploadId of (await configstore.list?.()) ?? []) {
    try {
      const info = await configstore.get(uploadId);
      if (info?.creation_date && Date.parse(info.creation_date) < cutoff) {
        await removeTusUpload(uploadId);
      }
    } catch (cause) {
      console.warn(`Could not clean up expired tus upload ${uploadId}`, cause);
    }
  }
}

export function startUploadCleanup(): void {
  startUploadMaintenance({
    finalizeUpload: async (uploadId, userId) => {
      await finalizeTusUpload(uploadId, userId);
    },
    removeTusUpload,
    deleteExpiredTusFiles: removeExpiredTusUploads,
  });
}

async function createServer(): Promise<Server> {
  const store = await getStore();
  const server = new Server({
    path: TUS_PATH,
    datastore: store,
    locker: new MemoryLocker(),
    maxSize: () => readInstanceSettings().maxUploadBytes,
    relativeLocation: true,
    allowedCredentials: true,
    allowedOrigins: [new URL(privateEnv.authUrl).origin],
    exposedHeaders: ["Upload-Project"],
    postReceiveInterval: 1_000,
    disableTerminationForFinishedUploads: true,
    onIncomingRequest: async (request, uploadId) => {
      if (
        request.method === "POST" ||
        request.method === "OPTIONS" ||
        !uploadId
      )
        return;
      try {
        requireOwnedUpload(uploadId, requireUserId(request));
      } catch (cause) {
        throw tusError(cause, "Upload lookup failed.");
      }
    },
    onUploadCreate: async (request, upload) => {
      const workspaceId = upload.metadata?.workspaceId;
      const filename = upload.metadata?.filename;
      if (!workspaceId || !isUuid(workspaceId)) {
        throw tusReject(400, "A valid workspaceId is required.");
      }
      if (!filename || upload.size === undefined || upload.size <= 0) {
        throw tusReject(
          400,
          "A filename and non-empty upload length are required.",
        );
      }
      const mediaType = declaredUploadMediaType(upload.metadata?.filetype);
      let projectId: string;
      try {
        projectId = createUploadProject({
          uploadId: upload.id,
          workspaceId,
          userId: requireUserId(request),
          filename,
          projectName: upload.metadata?.projectName ?? null,
          mediaType,
          sizeBytes: upload.size,
        });
      } catch (cause) {
        throw tusError(cause, "Upload creation failed.");
      }
      return {
        metadata: { ...upload.metadata, projectId },
      };
    },
    onUploadFinish: async (request, upload) => {
      const completed = await finalizeTusUpload(
        upload.id,
        requireUserId(request),
      ).catch((cause) => {
        throw tusError(
          cause,
          "Upload finalization failed.",
          `Could not finalize upload ${upload.id}`,
        );
      });
      return {
        headers: { "Upload-Project": completed.projectId },
      };
    },
  });

  server.on(EVENTS.POST_RECEIVE, (_request, upload: Upload) => {
    try {
      updateUploadProgress(upload.id, upload.offset);
    } catch (cause) {
      console.warn("Could not persist upload progress", cause);
    }
  });
  server.on(EVENTS.POST_TERMINATE, (request, _response, uploadId) => {
    try {
      cancelUpload(uploadId, requireUserId(request));
    } catch (cause) {
      console.warn("Could not cancel upload project", cause);
    }
  });
  return server;
}

function requireUserId(request: Request): string {
  const userId = request.headers.get(USER_HEADER);
  if (!userId) {
    throw tusReject(401, "Authentication required.");
  }
  return userId;
}

type TusRejection = { status_code: number; body: string };

function tusReject(status: number, message: string): TusRejection {
  return { status_code: status, body: `${message}\n` };
}

// tus answers these itself, so server failures are logged here rather than by
// the handleError hook.
export function tusError(
  cause: unknown,
  fallbackMessage: string,
  logMessage: string = fallbackMessage,
): TusRejection {
  const failure = clientFailure(cause);
  if (failure) return tusReject(failure.status, failure.message);
  console.error(logMessage, cause);
  return tusReject(500, fallbackMessage);
}

export function declaredUploadMediaType(
  declared: string | null | undefined,
): string | null {
  const trimmed = declared?.trim();
  if (!trimmed) return null;
  const mediaType = normalizeMediaType(trimmed);
  if (!mediaType) {
    throw tusReject(400, "Only audio and video uploads are supported.");
  }
  return mediaType;
}
