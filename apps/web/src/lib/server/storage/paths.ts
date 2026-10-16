import { extname, posix, resolve, sep } from "node:path";

import { privateEnv } from "$lib/server/env";

const SAFE_EXTENSION = /^\.[a-zA-Z0-9]{1,12}$/;

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
