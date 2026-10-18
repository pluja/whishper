import { describe, expect, it } from "vitest";

import { createUuid, isUuid } from "./uuid";

describe("isUuid", () => {
  it.each([
    "b14d765a-0cb2-4fa8-af80-c563ab57c959",
    "01890a5d-ac96-774b-bcce-b302099a8057",
    "B14D765A-0CB2-4FA8-AF80-C563AB57C959",
  ])("accepts RFC 4122 style ids: %s", (value) => {
    expect(isUuid(value)).toBe(true);
  });

  it.each(["", "demo", "b14d765a0cb24fa8af80c563ab57c959", "-".repeat(36)])(
    "rejects %j",
    (value) => {
      expect(isUuid(value)).toBe(false);
    },
  );

  it("rejects non-strings", () => {
    expect(isUuid(undefined)).toBe(false);
  });
});

describe("createUuid", () => {
  it("creates version 4 ids the server accepts as cue ids", () => {
    const value = createUuid();
    expect(isUuid(value)).toBe(true);
    expect(value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("creates a different id on every call", () => {
    const values = new Set(Array.from({ length: 10_000 }, () => createUuid()));
    expect(values.size).toBe(10_000);
  });

  it("works without crypto.randomUUID, as in an insecure context", () => {
    const ownDescriptor = Object.getOwnPropertyDescriptor(crypto, "randomUUID");
    Object.defineProperty(crypto, "randomUUID", {
      value: undefined,
      configurable: true,
    });
    try {
      expect(isUuid(createUuid())).toBe(true);
    } finally {
      if (ownDescriptor) {
        Object.defineProperty(crypto, "randomUUID", ownDescriptor);
      } else {
        Reflect.deleteProperty(crypto, "randomUUID");
      }
    }
  });
});
