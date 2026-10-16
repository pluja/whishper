import type { Queryable } from "./types";

// Every key is hashed with hashtextextended into Postgres' 64-bit advisory
// lock space. scripts/migrations.mjs holds a fixed numeric key of its own
// because it runs outside the application bundle.
export const lockKeys = {
  instanceSetup: "anysub:instance-setup",
  uploadSweep: "anysub:upload-sweep",
  projectMedia: (projectId: string) => `anysub:project-media:${projectId}`,
};

const HASHED_KEY = "hashtextextended($1, 0)";

export async function lockForTransaction(
  client: Queryable,
  key: string,
): Promise<void> {
  await client.query(`select pg_advisory_xact_lock(${HASHED_KEY})`, [key]);
}

export async function tryLockForSession(
  client: Queryable,
  key: string,
): Promise<boolean> {
  const result = await client.query<{ locked: boolean }>(
    `select pg_try_advisory_lock(${HASHED_KEY}) as locked`,
    [key],
  );
  return result.rows[0]?.locked === true;
}

export async function unlockForSession(
  client: Queryable,
  key: string,
): Promise<void> {
  await client.query(`select pg_advisory_unlock(${HASHED_KEY})`, [key]);
}
