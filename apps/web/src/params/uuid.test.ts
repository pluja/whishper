import { describe, expect, it } from "vitest";

import { match } from "./uuid";

describe("uuid param matcher", () => {
  it("routes only UUIDs", () => {
    expect(match("b14d765a-0cb2-4fa8-af80-c563ab57c959")).toBe(true);
    expect(match("not-a-uuid")).toBe(false);
  });
});
