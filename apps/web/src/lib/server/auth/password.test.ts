import { describe, expect, it } from "vitest";

import { passwordLengthProblem } from "#lib/server/auth/password.ts";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "#lib/shared/limits.ts";

describe("passwordLengthProblem", () => {
  it("accepts the allowed lengths and names the range otherwise", () => {
    expect(passwordLengthProblem("x".repeat(PASSWORD_MIN_LENGTH))).toBeNull();
    expect(passwordLengthProblem("x".repeat(PASSWORD_MAX_LENGTH))).toBeNull();
    expect(passwordLengthProblem("x".repeat(PASSWORD_MIN_LENGTH - 1))).toMatch(
      /^Use between/,
    );
    expect(
      passwordLengthProblem("x".repeat(PASSWORD_MAX_LENGTH + 1)),
    ).not.toBeNull();
  });
});
