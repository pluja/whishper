import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { account, user } from "#lib/server/auth/schema.ts";
import {
  createInstanceOwner,
  isInstanceInitialized,
  isValidOwnerEmail,
  workspaceSlug,
  type InstanceOwner,
} from "#lib/server/auth/instance.ts";
import { db } from "#lib/server/db/index.ts";
import { memberships, workspaces } from "#lib/server/db/schema.ts";

function owner(name: string): InstanceOwner {
  return {
    name,
    email: `${name.toLowerCase()}@example.test`,
    passwordHash: "hashed",
  };
}

describe("createInstanceOwner", () => {
  it("creates the administrator, a credential, a workspace and an owner membership", () => {
    expect(isInstanceInitialized()).toBe(false);

    expect(createInstanceOwner(owner("Ada"))).toBe("created");

    expect(isInstanceInitialized()).toBe(true);
    const created = db.select().from(user).get();
    expect(created?.role).toBe("admin");
    expect(db.select().from(account).get()).toMatchObject({
      userId: created?.id,
      providerId: "credential",
      password: "hashed",
    });
    expect(db.select().from(workspaces).get()).toMatchObject({
      name: "Ada's workspace",
      slug: workspaceSlug(created?.id ?? ""),
    });
    expect(db.select().from(memberships).get()).toMatchObject({
      userId: created?.id,
      role: "owner",
    });
  });

  it("refuses a second owner", () => {
    createInstanceOwner(owner("Ada"));

    expect(createInstanceOwner(owner("Grace"))).toBe("already-initialized");
    expect(db.select().from(user).all()).toHaveLength(1);
  });

  it("leaves no user or credential behind when the workspace insert fails", () => {
    db.run(
      sql`create temp trigger fail_workspace before insert on workspaces
          begin select raise(abort, 'injected failure'); end`,
    );

    expect(() => createInstanceOwner(owner("Ada"))).toThrow("injected failure");

    db.run(sql`drop trigger fail_workspace`);
    expect(db.select().from(user).all()).toEqual([]);
    expect(db.select().from(account).all()).toEqual([]);
  });
});

describe("workspaceSlug", () => {
  it("keeps only letters and digits of the user id", () => {
    expect(workspaceSlug("1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed")).toBe(
      "workspace-1b9d6bcdbbfd4b2d9b5dab8d",
    );
  });
});

describe("owner email validation", () => {
  it("accepts an address better-auth can sign in with", () => {
    expect(isValidOwnerEmail("ada@example.com")).toBe(true);
  });

  it.each(["admin@localhost", "a@b", "no-at-sign", "ada@example"])(
    "rejects %s, which better-auth sign-in would refuse",
    (email) => {
      expect(isValidOwnerEmail(email)).toBe(false);
    },
  );
});
