import { extname, posix, resolve, sep } from "node:path";

import { privateEnv } from "$lib/server/env";

const SAFE_EXTENSION = /^\.[a-zA-Z0-9]{1,12}$/;
const UPLOAD_STAGING_KEY = posix.join("staging", "uploads");
const WORKER_ARTIFACTS_KEY = posix.join("staging", "worker-artifacts");

function projectKey(workspaceId: string, projectId: string): string {
  return posix.join("workspaces", workspaceId, "projects", projectId);
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
    projectKey(workspaceId, projectId),
    "media",
    "original",
    canonicalName,
  );
}

export function derivativeStorageKey(
  workspaceId: string,
  projectId: string,
  directory: string,
  filename: string,
): string {
  return posix.join(
    projectKey(workspaceId, projectId),
    "media",
    directory,
    filename,
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

export function projectStoragePath(
  workspaceId: string,
  projectId: string,
): string {
  return resolveDataPath(projectKey(workspaceId, projectId));
}

export function uploadStagingDirectory(): string {
  return resolveDataPath(UPLOAD_STAGING_KEY);
}

export function stagedUploadPath(uploadId: string): string {
  return resolveDataPath(posix.join(UPLOAD_STAGING_KEY, uploadId));
}

// The tus file store keeps each upload's metadata beside its data file.
export function stagedUploadMetadataPath(uploadId: string): string {
  return resolveDataPath(posix.join(UPLOAD_STAGING_KEY, `${uploadId}.json`));
}

export function workerArtifactsPath(jobId: string): string {
  return resolveDataPath(posix.join(WORKER_ARTIFACTS_KEY, jobId));
}

export function workerAttemptPath(jobId: string, attempt: number): string {
  return resolveDataPath(
    posix.join(WORKER_ARTIFACTS_KEY, jobId, String(attempt)),
  );
}
