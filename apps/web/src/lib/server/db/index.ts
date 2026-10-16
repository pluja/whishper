import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import { privateEnv } from "$lib/server/env";

import { schema } from "$lib/server/auth/schema";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: privateEnv.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export const db = drizzle({ client: pool, schema });
