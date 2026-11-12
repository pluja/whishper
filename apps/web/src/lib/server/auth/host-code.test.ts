import { describe, expect, it } from "vitest";

import {
  generateHostCode,
  hostCodesMatch,
} from "#lib/server/auth/host-code.ts";

describe("generateHostCode", () => {
  it("makes three dash-separated groups without look-alike characters", () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      expect(generateHostCode()).toMatch(
        /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/,
      );
    }
  });

  it("does not repeat itself", () => {
    const codes = new Set(Array.from({ length: 200 }, generateHostCode));
    expect(codes.size).toBe(200);
  });
});

describe("hostCodesMatch", () => {
  it("ignores case, spaces and dashes in what the user typed", () => {
    expect(hostCodesMatch("K7QD-M3XP-9RTA", " k7qd m3xp9rta ")).toBe(true);
  });

  it("rejects a different or partial code", () => {
    expect(hostCodesMatch("K7QD-M3XP-9RTA", "K7QD-M3XP-9RTB")).toBe(false);
    expect(hostCodesMatch("K7QD-M3XP-9RTA", "K7QD-M3XP")).toBe(false);
    expect(hostCodesMatch("K7QD-M3XP-9RTA", "")).toBe(false);
  });
});
