import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { migrateDatabase } from "#lib/server/db/migrate.ts";

const MIGRATIONS = resolve("migrations");

type Journal = { entries: { tag: string }[] };

// A migrations folder holding only the first migration, as an instance
// installed before any later one would have applied.
async function foundationOnly(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "anysub-migrations-"));
  await mkdir(join(folder, "meta"));
  const journal = JSON.parse(
    await readFile(join(MIGRATIONS, "meta/_journal.json"), "utf8"),
  ) as Journal;
  const first = journal.entries[0];
  if (!first) throw new Error("The migrations journal is empty.");
  await writeFile(
    join(folder, "meta/_journal.json"),
    JSON.stringify({ ...journal, entries: [first] }),
  );
  await copyFile(
    join(MIGRATIONS, `${first.tag}.sql`),
    join(folder, `${first.tag}.sql`),
  );
  return folder;
}

function seedFoundationInstance(sqlite: Database.Database): void {
  const run = (statement: string, ...values: unknown[]) =>
    sqlite.prepare(statement).run(...values);
  run(
    "insert into auth_users (id, name, email, created_at) values (?, ?, ?, ?)",
    "owner",
    "Owner",
    "owner@example.org",
    1_000,
  );
  run(
    "insert into auth_users (id, name, email, created_at) values (?, ?, ?, ?)",
    "later",
    "Later",
    "later@example.org",
    2_000,
  );
  run("insert into workspaces (id, name, slug) values ('w', 'W', 'w')");
  run(
    "insert into projects (id, workspace_id, name, created_by) values ('p', 'w', 'P', 'owner')",
  );
  run(
    `insert into jobs (id, workspace_id, project_id, kind, payload)
     values ('j', 'w', 'p', 'media_prepare', '{}')`,
  );
  run(
    `insert into media_derivatives (id, project_id, job_id, kind, storage_key,
       source_storage_key, media_type, size_bytes, schema_version, generator_version)
     values ('d', 'p', 'j', 'waveform', 'k', 's', 'application/json', 1, '1.0', '1.0')`,
  );
}

describe("migrateDatabase", () => {
  it("upgrades an existing instance without firing cascades", async () => {
    const sqlite = new Database(":memory:");
    migrateDatabase(sqlite, await foundationOnly());
    seedFoundationInstance(sqlite);

    migrateDatabase(sqlite, MIGRATIONS);

    expect(
      sqlite.prepare("select job_id from media_derivatives").get(),
    ).toEqual({ job_id: "j" });
    expect(
      sqlite.prepare("select id, role from auth_users order by id").all(),
    ).toEqual([
      { id: "later", role: "user" },
      { id: "owner", role: "admin" },
    ]);
    expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("refuses to finish with broken references", async () => {
    const sqlite = new Database(":memory:");
    migrateDatabase(sqlite, await foundationOnly());
    sqlite.pragma("foreign_keys = OFF");
    sqlite
      .prepare(
        "insert into memberships (workspace_id, user_id, role) values ('none', 'none', 'owner')",
      )
      .run();

    expect(() => migrateDatabase(sqlite, MIGRATIONS)).toThrow(
      /broken references/,
    );
  });
});
