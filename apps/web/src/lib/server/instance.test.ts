import { describe, expect, it } from "vitest";

import { createInstanceOwner, isValidOwnerEmail } from "./instance";

const OWNER = {
  name: "Ada",
  email: "ada@example.com",
  passwordHash: "hashed",
};

type FakeOptions = { userExists?: boolean; failOn?: string };

function fakeDatabase({ userExists = false, failOn }: FakeOptions = {}) {
  const statements: string[] = [];
  const parameters: unknown[][] = [];
  let released = false;
  const client = {
    async query(text: string, values: unknown[] = []) {
      statements.push(text);
      parameters.push(values);
      if (failOn && text.includes(failOn)) throw new Error("insert failed");
      if (text.includes("exists(select 1 from auth_users)"))
        return { rows: [{ initialized: userExists }] };
      if (text.includes("returning id"))
        return { rows: [{ id: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed" }] };
      return { rows: [] };
    },
    release() {
      released = true;
    },
  };
  return {
    database: { connect: async () => client } as never,
    statements,
    parameters,
    isReleased: () => released,
  };
}

describe("instance owner setup", () => {
  it("creates the owner, workspace and membership in one locked transaction", async () => {
    const fake = fakeDatabase();

    await expect(createInstanceOwner(OWNER, fake.database)).resolves.toBe(
      "created",
    );

    expect(fake.statements[0]).toBe("begin");
    expect(fake.statements[1]).toContain("pg_advisory_xact_lock");
    expect(fake.statements.at(-1)).toBe("commit");
    expect(fake.statements.some((s) => s.includes("into memberships"))).toBe(
      true,
    );
    expect(fake.isReleased()).toBe(true);
  });

  it("derives a workspace slug without stray hyphens", async () => {
    const fake = fakeDatabase();

    await createInstanceOwner(OWNER, fake.database);

    const workspaceInsert = fake.statements.findIndex((s) =>
      s.includes("into workspaces"),
    );
    expect(fake.parameters[workspaceInsert][1]).toBe(
      "workspace-1b9d6bcdbbfd4b2d9b5dab8d",
    );
  });

  it("refuses when a user already exists", async () => {
    const fake = fakeDatabase({ userExists: true });

    await expect(createInstanceOwner(OWNER, fake.database)).resolves.toBe(
      "already-initialized",
    );

    expect(fake.statements.some((s) => s.includes("insert"))).toBe(false);
    expect(fake.statements.at(-1)).toBe("commit");
    expect(fake.isReleased()).toBe(true);
  });

  it("rolls back the user when the workspace cannot be created", async () => {
    const fake = fakeDatabase({ failOn: "into workspaces" });

    await expect(createInstanceOwner(OWNER, fake.database)).rejects.toThrow(
      "insert failed",
    );

    expect(fake.statements.some((s) => s.includes("into auth_users"))).toBe(
      true,
    );
    expect(fake.statements).not.toContain("commit");
    expect(fake.statements.at(-1)).toBe("rollback");
    expect(fake.isReleased()).toBe(true);
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
