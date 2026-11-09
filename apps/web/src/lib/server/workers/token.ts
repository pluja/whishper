import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { instanceSecret } from "$lib/server/db/secrets";
import { privateEnv } from "$lib/server/env";

let token: string | undefined;

export function workerToken(): string {
  token ??= privateEnv.workerTokenOverride ?? instanceSecret("worker-token");
  return token;
}

// The local worker reads the token from the shared data volume, so neither
// container needs it configured. The file is rewritten on every start.
export async function publishWorkerToken(): Promise<void> {
  const directory = join(privateEnv.dataRoot, ".anysub");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const target = join(directory, "worker-token");
  const staging = `${target}.${process.pid}.tmp`;
  await writeFile(staging, workerToken(), { mode: 0o600 });
  await rename(staging, target);
}
