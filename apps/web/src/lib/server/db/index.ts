import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import { privateEnv } from "$lib/server/env";

import { schema } from "$lib/server/auth/schema";

const { Pool, types } = pg;

const STATEMENT_TIMEOUT_MS = 30_000;
const IDLE_IN_TRANSACTION_TIMEOUT_MS = 60_000;

// Every bigint column holds microsecond durations, byte sizes bounded by the
// upload limit, or revision counters, all far below 2^53. The check turns a
// broken invariant into an error instead of silently rounded data.
types.setTypeParser(types.builtins.INT8, (value) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new RangeError(`bigint ${value} is outside the safe integer range`);
  }
  return parsed;
});

export const pool = new Pool({
  connectionString: privateEnv.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: STATEMENT_TIMEOUT_MS,
  idle_in_transaction_session_timeout: IDLE_IN_TRANSACTION_TIMEOUT_MS,
});

// An idle client can lose its connection (a database restart, a network
// drop). Without a listener the pool re-emits that as an uncaught exception.
pool.on("error", (cause) => {
  console.error("An idle database connection failed", cause);
});

export const db = drizzle({ client: pool, schema });
