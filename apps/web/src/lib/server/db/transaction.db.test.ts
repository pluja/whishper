import { describe, expect, it } from "vitest";

import { db } from "#lib/server/db/index.ts";
import { workspaces } from "#lib/server/db/schema.ts";
import { withTransaction } from "#lib/server/db/transaction.ts";

describe("withTransaction", () => {
  it("commits the work and returns its result", () => {
    const id = withTransaction(
      (tx) =>
        tx
          .insert(workspaces)
          .values({ name: "Kept", slug: "kept" })
          .returning({ id: workspaces.id })
          .get().id,
    );

    expect(db.select().from(workspaces).get()?.id).toBe(id);
  });

  it("rolls everything back when the work throws", () => {
    expect(() =>
      withTransaction((tx) => {
        tx.insert(workspaces).values({ name: "Lost", slug: "lost" }).run();
        throw new Error("boom");
      }),
    ).toThrow("boom");

    expect(db.select().from(workspaces).all()).toEqual([]);
  });

  it("refuses asynchronous work", () => {
    expect(() =>
      withTransaction(async () => {
        await Promise.resolve();
      }),
    ).toThrow();
  });
});
