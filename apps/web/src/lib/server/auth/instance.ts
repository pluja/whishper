import { randomUUID } from "node:crypto";

import { z } from "zod";

import { account, user } from "#lib/server/auth/schema.ts";
import { db, type Executor } from "#lib/server/db/index.ts";
import { memberships, workspaces } from "#lib/server/db/schema.ts";
import { withTransaction } from "#lib/server/db/transaction.ts";

export type InstanceOwner = {
  name: string;
  email: string;
  passwordHash: string;
};

export type OwnerSetupOutcome = "created" | "already-initialized";

export function isInstanceInitialized(executor: Executor = db): boolean {
  return (
    executor.select({ id: user.id }).from(user).limit(1).get() !== undefined
  );
}

// better-auth sign-in rejects any address z.email() refuses, so an owner
// created with one could never log in.
export function isValidOwnerEmail(email: string): boolean {
  return z.email().safeParse(email).success;
}

export function workspaceSlug(userId: string): string {
  return `workspace-${userId
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 24)}`;
}

// The owner is written straight into better-auth's tables because public
// sign-up is disabled, and one transaction keeps the user, its credential,
// the workspace and the membership all-or-nothing.
export function createInstanceOwner(owner: InstanceOwner): OwnerSetupOutcome {
  return withTransaction((tx) => {
    if (isInstanceInitialized(tx)) return "already-initialized";

    const userId = randomUUID();
    tx.insert(user)
      .values({
        id: userId,
        name: owner.name,
        email: owner.email,
        role: "admin",
      })
      .run();
    tx.insert(account)
      .values({
        id: randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: owner.passwordHash,
      })
      .run();
    const workspace = tx
      .insert(workspaces)
      .values({
        name: `${owner.name}'s workspace`,
        slug: workspaceSlug(userId),
      })
      .returning({ id: workspaces.id })
      .get();
    tx.insert(memberships)
      .values({ workspaceId: workspace.id, userId, role: "owner" })
      .run();
    return "created";
  });
}
