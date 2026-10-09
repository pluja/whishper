import { FileStore } from "@tus/file-store";
import { EVENTS, MemoryLocker, Server, type Upload } from "@tus/server";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { privateEnv } from "$lib/server/env";
import {
  cancelUpload,
  completeUpload,
  createUploadProject,
  requireOwnedUpload,
  updateUploadProgress,
} from "$lib/server/media";
import { normalizeMediaType } from "$lib/server/media-stream";
import {
  startUploadMaintenance,
  UPLOAD_EXPIRATION_MS,
} from "$lib/server/upload-maintenance";
import { isUuid } from "$lib/uuid";

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
    const stagingDirectory = resolve(privateEnv.dataRoot, "staging", "uploads");
    await mkdir(stagingDirectory, { recursive: true });
    return new FileStore({
      directory: stagingDirectory,
      expirationPeriodInMilliseconds: UPLOAD_EXPIRATION_MS,
    });
  })();
  return storePromise;
}

export function startUploadCleanup(): void {
  startUploadMaintenance({
    removeTusUpload: async (uploadId) => {
      const store = await getStore();
      await store.remove(uploadId).catch(() => undefined);
      await store.configstore.delete(uploadId).catch(() => undefined);
    },
    deleteExpiredTusFiles: async () => {
      await (await getStore()).deleteExpired();
    },
  });
}

async function createServer(): Promise<Server> {
  const store = await getStore();
  const server = new Server({
    path: TUS_PATH,
    datastore: store,
    locker: new MemoryLocker(),
    maxSize: privateEnv.maxUploadBytes,
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
      await requireOwnedUpload(uploadId, requireUserId(request)).catch(
        (cause) => {
          throw tusError(cause);
        },
      );
    },
    onUploadCreate: async (request, upload) => {
      const workspaceId = upload.metadata?.workspaceId;
      const filename = upload.metadata?.filename;
      if (!workspaceId || !isUuid(workspaceId)) {
        throw { status_code: 400, body: "A valid workspaceId is required.\n" };
      }
      if (!filename || upload.size === undefined || upload.size <= 0) {
        throw {
          status_code: 400,
          body: "A filename and non-empty upload length are required.\n",
        };
      }
      const mediaType = declaredUploadMediaType(upload.metadata?.filetype);
      const projectId = await createUploadProject({
        uploadId: upload.id,
        workspaceId,
        userId: requireUserId(request),
        filename,
        projectName: upload.metadata?.projectName ?? null,
        mediaType,
        sizeBytes: upload.size,
      }).catch((cause) => {
        throw tusError(cause);
      });
      return {
        metadata: { ...upload.metadata, projectId },
      };
    },
    onUploadFinish: async (request, upload) => {
      const completed = await completeUpload(
        upload.id,
        requireUserId(request),
      ).catch((cause) => {
        console.error(`Could not finalize upload ${upload.id}`, cause);
        throw tusError(cause);
      });
      await store.configstore.delete(upload.id).catch((cause) => {
        console.warn("Could not remove completed tus metadata", cause);
      });
      return {
        headers: { "Upload-Project": completed.projectId },
      };
    },
  });

  server.on(EVENTS.POST_RECEIVE, (_request, upload: Upload) => {
    void updateUploadProgress(upload.id, upload.offset).catch((cause) => {
      console.warn("Could not persist upload progress", cause);
    });
  });
  server.on(EVENTS.POST_TERMINATE, (request, _response, uploadId) => {
    void cancelUpload(uploadId, requireUserId(request)).catch((cause) => {
      console.warn("Could not cancel upload project", cause);
    });
  });
  return server;
}

function requireUserId(request: Request): string {
  const userId = request.headers.get(USER_HEADER);
  if (!userId) {
    throw { status_code: 401, body: "Authentication required.\n" };
  }
  return userId;
}

function tusError(cause: unknown): { status_code: number; body: string } {
  const statusCode =
    cause && typeof cause === "object" && "statusCode" in cause
      ? Number(cause.statusCode)
      : 500;
  const message = cause instanceof Error ? cause.message : "Upload failed.";
  return {
    status_code: Number.isInteger(statusCode) ? statusCode : 500,
    body: `${statusCode >= 500 ? "Upload finalization failed." : message}\n`,
  };
}

export function declaredUploadMediaType(
  declared: string | null | undefined,
): string | null {
  const trimmed = declared?.trim();
  if (!trimmed) return null;
  const mediaType = normalizeMediaType(trimmed);
  if (!mediaType) {
    throw {
      status_code: 400,
      body: "Only audio and video uploads are supported.\n",
    };
  }
  return mediaType;
}
