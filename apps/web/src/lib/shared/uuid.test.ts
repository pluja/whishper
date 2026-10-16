import { describe, expect, it } from "vitest";

import { isUuid } from "./uuid";

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
