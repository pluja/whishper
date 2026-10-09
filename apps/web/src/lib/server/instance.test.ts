import { describe, expect, it } from "vitest";

import { createInstanceOwner } from "./instance";

const OWNER = {
  name: "Ada",
  email: "ada@example.com",
  passwordHash: "hashed",
};

type FakeOptions = { userExists?: boolean; failOn?: string };

function fakeDatabase({ userExists = false, failOn }: FakeOptions = {}) {
  const statements: string[] = [];
  let released = false;
  const client = {
    async query(text: string) {
      statements.push(text);
      if (failOn && text.includes(failOn)) throw new Error("insert failed");
      if (text.includes("exists(select 1 from auth_users)"))
        return { rows: [{ initialized: userExists }] };
      if (text.includes("returning id")) return { rows: [{ id: "new-id" }] };
      return { rows: [] };
    },
    release() {
      released = true;
    },
  };
  return {
    database: { connect: async () => client } as never,
    statements,
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

  it("refuses when a user already exists", async () => {
    const fake = fakeDatabase({ userExists: true });

    await expect(createInstanceOwner(OWNER, fake.database)).resolves.toBe(
      "already-initialized",
    );

    expect(fake.statements.some((s) => s.includes("insert"))).toBe(false);
    expect(fake.statements.at(-1)).toBe("rollback");
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
