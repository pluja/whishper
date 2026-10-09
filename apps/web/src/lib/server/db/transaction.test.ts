import { describe, expect, it } from "vitest";

import { withTransaction } from "./transaction";

function fakeSource({ failRollback = false } = {}) {
  const statements: string[] = [];
  const releases: unknown[] = [];
  const client = {
    async query(text: string) {
      statements.push(text);
      if (failRollback && text === "rollback")
        throw new Error("connection lost");
      return { rows: [] };
    },
    release(discard?: unknown) {
      releases.push(discard);
    },
  };
  return {
    source: { connect: async () => client } as never,
    statements,
    releases,
    client,
  };
}

describe("withTransaction", () => {
  it("commits and releases when the work succeeds", async () => {
    const fake = fakeSource();

    const result = await withTransaction(async (client) => {
      await client.query("select 1");
      return "done";
    }, fake.source);

    expect(result).toBe("done");
    expect(fake.statements).toEqual(["begin", "select 1", "commit"]);
    expect(fake.releases).toEqual([false]);
  });

  it("rolls back, rethrows and releases when the work throws", async () => {
    const fake = fakeSource();
    const failure = new Error("boom");

    await expect(
      withTransaction(async () => {
        throw failure;
      }, fake.source),
    ).rejects.toBe(failure);

    expect(fake.statements).toEqual(["begin", "rollback"]);
    expect(fake.releases).toEqual([false]);
  });

  it("rethrows the original error and discards the client when rollback fails", async () => {
    const fake = fakeSource({ failRollback: true });
    const failure = new Error("boom");

    await expect(
      withTransaction(async () => {
        throw failure;
      }, fake.source),
    ).rejects.toBe(failure);

    expect(fake.releases).toEqual([true]);
  });

  it("rolls back when the commit itself fails", async () => {
    const fake = fakeSource();
    const query = fake.client.query.bind(fake.client);
    fake.client.query = async (text: string) => {
      if (text === "commit") throw new Error("commit failed");
      return query(text);
    };

    await expect(withTransaction(async () => 1, fake.source)).rejects.toThrow(
      "commit failed",
    );

    expect(fake.statements).toEqual(["begin", "rollback"]);
    expect(fake.releases).toEqual([false]);
  });
});
