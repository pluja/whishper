import { describe, expect, it } from "vitest";

import { withKeyedLock } from "#lib/server/storage/keyed-lock.ts";

describe("withKeyedLock", () => {
  it("runs same-key work one at a time and keeps going after a failure", async () => {
    const order: string[] = [];
    const slow = withKeyedLock("k", async () => {
      order.push("slow:start");
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push("slow:end");
      throw new Error("boom");
    });
    const next = withKeyedLock("k", async () => {
      order.push("next");
      return "ok";
    });
    await expect(slow).rejects.toThrow("boom");
    await expect(next).resolves.toBe("ok");
    expect(order).toEqual(["slow:start", "slow:end", "next"]);
  });

  it("lets different keys run side by side", async () => {
    const order: string[] = [];
    let release = () => {};
    const blocked = withKeyedLock("a", async () => {
      await new Promise<void>((resolve) => (release = resolve));
      order.push("a");
    });
    await withKeyedLock("b", async () => {
      order.push("b");
    });
    release();
    await blocked;
    expect(order).toEqual(["b", "a"]);
  });
});
