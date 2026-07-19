import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import pg from "pg";

const { Client } = pg;
const migrationsDirectory = resolve("migrations");
const client = new Client({ connectionString: process.env.DATABASE_URL });

await client.connect();

try {
  await client.query("select pg_advisory_lock($1)", [719_602_124]);
  await client.query(`
    create table if not exists anysub_migrations (
      name text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);

  const files = (await readdir(migrationsDirectory))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const name of files) {
    const sql = await readFile(resolve(migrationsDirectory, name), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const existing = await client.query(
      "select checksum from anysub_migrations where name = $1",
      [name],
    );

    if (existing.rowCount === 1) {
      if (existing.rows[0].checksum !== checksum) {
        throw new Error(`Applied migration changed: ${name}`);
      }
      continue;
    }

    await client.query("begin");
    try {
      await client.query(sql);
      await client.query(
        "insert into anysub_migrations (name, checksum) values ($1, $2)",
        [name, checksum],
      );
      await client.query("commit");
      console.log(`Applied ${name}`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
} finally {
  await client
    .query("select pg_advisory_unlock($1)", [719_602_124])
    .catch(() => undefined);
  await client.end();
}
