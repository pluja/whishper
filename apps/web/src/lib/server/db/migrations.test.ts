import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  generateSQLiteDrizzleJson,
  generateSQLiteMigration,
} from "drizzle-kit/api";
import { describe, expect, it } from "vitest";

import * as authSchema from "#lib/server/auth/schema.ts";
import * as appSchema from "#lib/server/db/schema.ts";

const MIGRATIONS = resolve("migrations");

type Journal = { entries: { idx: number; tag: string }[] };

async function latestSnapshot() {
  const journal = JSON.parse(
    await readFile(resolve(MIGRATIONS, "meta/_journal.json"), "utf8"),
  ) as Journal;
  const latest = journal.entries.at(-1);
  if (!latest) throw new Error("The migrations journal is empty.");
  const index = String(latest.idx).padStart(4, "0");
  return JSON.parse(
    await readFile(resolve(MIGRATIONS, `meta/${index}_snapshot.json`), "utf8"),
  );
}

describe("generated migrations", () => {
  it("cover every change in the schema", async () => {
    const previous = await latestSnapshot();
    const current = await generateSQLiteDrizzleJson(
      { ...authSchema, ...appSchema },
      previous.id,
    );

    const pending = await generateSQLiteMigration(previous, current);

    expect(
      pending,
      "Run `make db-generate` and commit the new migration.",
    ).toEqual([]);
  });
});
