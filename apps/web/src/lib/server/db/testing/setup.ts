import { afterAll, afterEach, vi } from "vitest";

import { pool } from "$lib/server/db";

import { deleteSeededRows } from "./fixtures";

vi.mock("$env/dynamic/private", async () => {
  const { testDatabaseUrl } = await import("./database-url");
  return { env: { DATABASE_URL: testDatabaseUrl() } };
});

afterEach(() => deleteSeededRows());

afterAll(() => pool.end());
