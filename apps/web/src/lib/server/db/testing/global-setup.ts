import pg from "pg";

import { applyMigrations } from "../../../../../scripts/migrations.mjs";
import { testDatabaseUrl } from "./database-url";

export default async function setup(): Promise<void> {
  const client = new pg.Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    await applyMigrations(client);
  } finally {
    await client.end();
  }
}
