import { z } from "zod";

import { pool } from "$lib/server/db";
import { lockForTransaction, lockKeys } from "$lib/server/db/locks";
import { withTransaction } from "$lib/server/db/transaction";
import type { Connectable, Queryable } from "$lib/server/db/types";

export type InstanceOwner = {
  name: string;
  email: string;
  passwordHash: string;
};

export type OwnerSetupOutcome = "created" | "already-initialized";

export async function isInstanceInitialized(
  database: Queryable = pool,
): Promise<boolean> {
  const result = await database.query<{ initialized: boolean }>(
    "select exists(select 1 from auth_users) as initialized",
  );
  return result.rows[0].initialized;
}

// better-auth sign-in rejects any address z.email() refuses, so an owner
// created with one could never log in.
export function isValidOwnerEmail(email: string): boolean {
  return z.email().safeParse(email).success;
}

function workspaceSlug(userId: string): string {
  return `workspace-${userId
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 24)}`;
}

// The owner is written straight into better-auth's tables because public
// sign-up is disabled, and a single transaction is the only way to keep the
// user, its credential, the workspace and the membership all-or-nothing.
export async function createInstanceOwner(
  owner: InstanceOwner,
  database: Connectable = pool,
): Promise<OwnerSetupOutcome> {
  return withTransaction(async (client) => {
    await lockForTransaction(client, lockKeys.instanceSetup);
    if (await isInstanceInitialized(client)) return "already-initialized";

    const user = await client.query<{ id: string }>(
      `insert into auth_users (id, name, email)
       values (gen_random_uuid()::text, $1, $2)
       returning id`,
      [owner.name, owner.email],
    );
    const userId = user.rows[0].id;
    await client.query(
      `insert into auth_accounts (id, account_id, provider_id, user_id, password)
       values (gen_random_uuid()::text, $1, 'credential', $1, $2)`,
      [userId, owner.passwordHash],
    );
    const workspace = await client.query<{ id: string }>(
      "insert into workspaces (name, slug) values ($1, $2) returning id",
      [`${owner.name}'s workspace`, workspaceSlug(userId)],
    );
    await client.query(
      `insert into memberships (workspace_id, user_id, role) values ($1, $2, 'owner')`,
      [workspace.rows[0].id, userId],
    );
    return "created";
  }, database);
}
