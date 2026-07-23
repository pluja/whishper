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

const TUS_PATH = "/api/uploads";
const USER_HEADER = "x-anysub-authenticated-user";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

async function createServer(): Promise<Server> {
  const stagingDirectory = resolve(privateEnv.dataRoot, "staging", "uploads");
  await mkdir(stagingDirectory, { recursive: true });
  const store = new FileStore({
    directory: stagingDirectory,
    expirationPeriodInMilliseconds: 7 * 24 * 60 * 60 * 1_000,
  });
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
      if (!workspaceId || !UUID.test(workspaceId)) {
        throw { status_code: 400, body: "A valid workspaceId is required.\n" };
      }
      if (!filename || upload.size === undefined || upload.size <= 0) {
        throw {
          status_code: 400,
          body: "A filename and non-empty upload length are required.\n",
        };
      }
      const projectId = await createUploadProject({
        uploadId: upload.id,
        workspaceId,
        userId: requireUserId(request),
        filename,
        projectName: upload.metadata?.projectName ?? null,
        mediaType: upload.metadata?.filetype ?? null,
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
