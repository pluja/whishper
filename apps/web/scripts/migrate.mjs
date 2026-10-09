import pg from "pg";

import { applyMigrations } from "./migrations.mjs";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

await client.connect();

try {
  for (const name of await applyMigrations(client)) {
    console.log(`Applied ${name}`);
  }
} finally {
  await client.end();
}
