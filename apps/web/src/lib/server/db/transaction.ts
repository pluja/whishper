import { db, type Executor } from "#lib/server/db/index.ts";

// The work must be synchronous: better-sqlite3 refuses a promise, and since a
// synchronous transaction cannot interleave with another request, it needs no
// row or advisory locks. Do file work before or after, never inside.
export function withTransaction<T>(work: (tx: Executor) => T): T {
  return db.transaction((tx) => work(tx), { behavior: "immediate" });
}
