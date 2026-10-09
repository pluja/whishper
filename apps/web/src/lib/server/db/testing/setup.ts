import { afterAll, vi } from "vitest";

import { pool } from "$lib/server/db";

vi.mock("$env/dynamic/private", async () => {
  const { testDatabaseUrl } = await import("./database-url");
  return { env: { DATABASE_URL: testDatabaseUrl() } };
});

afterAll(() => pool.end());
