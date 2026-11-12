import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";

import { db, type Executor } from "#lib/server/db/index.ts";
import { instanceSecrets } from "#lib/server/db/schema.ts";

export type SecretName = "session-signing" | "worker-token";

// Stored next to the data it protects, so a backup and restore keep them
// together. Losing one only signs everyone out or makes the worker reconnect.
export function instanceSecret(
  name: SecretName,
  executor: Executor = db,
): string {
  executor
    .insert(instanceSecrets)
    .values({ name, value: randomBytes(48).toString("base64url") })
    .onConflictDoNothing()
    .run();
  const stored = executor
    .select({ value: instanceSecrets.value })
    .from(instanceSecrets)
    .where(eq(instanceSecrets.name, name))
    .get();
  if (!stored) throw new Error(`The ${name} secret could not be stored.`);
  return stored.value;
}
