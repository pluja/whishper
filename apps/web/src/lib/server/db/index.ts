import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { building } from "$app/environment";
import Database from "better-sqlite3";
import type { RunResult } from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

import * as authSchema from "$lib/server/auth/schema";
import { migrateDatabase } from "$lib/server/db/migrate";
import * as appSchema from "$lib/server/db/schema";
import { privateEnv } from "$lib/server/env";
import { normalizeSearchText } from "$lib/shared/search";

const schema = { ...authSchema, ...appSchema };
const IN_MEMORY = ":memory:";

function open(file: string) {
  if (file !== IN_MEMORY) mkdirSync(dirname(file), { recursive: true });
  const sqlite = new Database(file);
  // WAL lets reads proceed while a write commits.
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  // SQLite's own lower() folds ASCII only and keeps accents.
  sqlite.function("search_text", { deterministic: true }, (value) =>
    typeof value === "string" ? normalizeSearchText(value) : value,
  );
  const database = drizzle({ client: sqlite, schema });
  // The working directory is apps/web in development and tests, and /app in
  // the image, which both hold the generated migrations folder.
  migrateDatabase(sqlite, resolve("migrations"));
  return database;
}

// The build imports server modules to analyse routes, and must not create or
// migrate the real database while it does.
export const db = open(building ? IN_MEMORY : privateEnv.databaseFile);

export type Executor = BaseSQLiteDatabase<"sync", RunResult, typeof schema>;
