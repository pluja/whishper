import type Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

// drizzle-kit changes a column by copying its table and dropping the old one.
// SQLite ignores the PRAGMA foreign_keys=OFF in that migration because it runs
// inside a transaction, so the drop would fire ON DELETE actions on every row
// that points at the table. Enforcement stays off while migrating, and every
// reference is checked before it comes back on.
export function migrateDatabase(
  sqlite: Database.Database,
  migrationsFolder: string,
): void {
  sqlite.pragma("foreign_keys = OFF");
  migrate(drizzle({ client: sqlite }), { migrationsFolder });
  const violations = sqlite.pragma("foreign_key_check") as unknown[];
  if (violations.length > 0) {
    throw new Error(
      `The database migration left ${violations.length} broken references.`,
    );
  }
  sqlite.pragma("foreign_keys = ON");
}
