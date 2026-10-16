import { describe, expect, it } from "vitest";

import { generateLeaseToken, hashToken } from "./lease-token";

describe("hashToken", () => {
  it("returns the sha256 hex digest", () => {
    expect(hashToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("generateLeaseToken", () => {
  it("returns a distinct url-safe token of at least 24 characters", () => {
    const first = generateLeaseToken();
    expect(first).toMatch(/^[A-Za-z0-9_-]{24,}$/);
    expect(generateLeaseToken()).not.toBe(first);
  });
});
