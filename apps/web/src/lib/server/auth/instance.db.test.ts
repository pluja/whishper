import type { Pool, PoolClient } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { pool } from "$lib/server/db";
import {
  createInstanceOwner,
  type InstanceOwner,
} from "$lib/server/auth/instance";

function owner(name: string): InstanceOwner {
  return {
    name,
    email: `${name.toLowerCase()}@example.test`,
    passwordHash: "hashed",
  };
}

async function countRows(table: "auth_users" | "auth_accounts") {
  const result = await pool.query<{ count: number }>(
    `select count(*)::int as count from ${table}`,
  );
  return result.rows[0].count;
}

// Wraps a real pooled connection so every other statement still runs in Postgres.
function failingOn(statement: string): Pick<Pool, "connect"> {
  return {
    connect: async () => {
      const client = await pool.connect();
      return {
        query: (text: string, values?: unknown[]) => {
          if (text.includes(statement)) {
            return Promise.reject(new Error("injected failure"));
          }
          return client.query(text, values);
        },
        release: (destroy?: boolean) => client.release(destroy),
      } as unknown as PoolClient;
    },
  } as Pick<Pool, "connect">;
}

beforeEach(async () => {
  expect(await countRows("auth_users")).toBe(0);
});

afterEach(async () => {
  await pool.query(
    `delete from workspaces
      where id in (select workspace_id from memberships m
                     join auth_users u on u.id = m.user_id
                    where u.email like '%@example.test')`,
  );
  await pool.query(`delete from auth_users where email like '%@example.test'`);
});

describe("createInstanceOwner", () => {
  it("creates exactly one owner when two setups race", async () => {
    const outcomes = await Promise.all([
      createInstanceOwner(owner("Ada")),
      createInstanceOwner(owner("Grace")),
    ]);

    expect(outcomes.sort()).toEqual(["already-initialized", "created"]);
    expect(await countRows("auth_users")).toBe(1);
    expect(await countRows("auth_accounts")).toBe(1);
    const memberships = await pool.query<{ role: string }>(
      `select role from memberships`,
    );
    expect(memberships.rows).toEqual([{ role: "owner" }]);
  });

  it("leaves no user or credential behind when the workspace insert fails", async () => {
    await expect(
      createInstanceOwner(owner("Ada"), failingOn("insert into workspaces")),
    ).rejects.toThrow("injected failure");

    expect(await countRows("auth_users")).toBe(0);
    expect(await countRows("auth_accounts")).toBe(0);
  });
});
