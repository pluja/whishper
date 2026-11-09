import { describe, expect, it } from "vitest";

import { instanceSecret } from "$lib/server/db/secrets";

describe("instanceSecret", () => {
  it("creates a long URL-safe secret once and returns it afterwards", () => {
    const first = instanceSecret("worker-token");

    expect(first).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(instanceSecret("worker-token")).toBe(first);
  });

  it("keeps each named secret separate", () => {
    expect(instanceSecret("session-signing")).not.toBe(
      instanceSecret("worker-token"),
    );
  });
});
