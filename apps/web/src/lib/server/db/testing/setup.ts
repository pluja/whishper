import { afterAll, afterEach, vi } from "vitest";

import { pool } from "$lib/server/db";

import { assertTestDatabaseUrl } from "./database-url";
import { deleteSeededRows } from "./fixtures";

vi.mock("$env/dynamic/private", async () => {
  const { testDatabaseUrl } = await import("./database-url");
  return { env: { DATABASE_URL: testDatabaseUrl() } };
});

// The pool reads its URL through the mocked environment above. Checking the
// live connection string catches a pool that bypassed that mock.
assertTestDatabaseUrl(pool.options.connectionString ?? "");

afterEach(() => deleteSeededRows());

afterAll(() => pool.end());
