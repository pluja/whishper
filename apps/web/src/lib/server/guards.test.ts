import { describe, expect, it } from "vitest";

import { isNodeError } from "./guards";

describe("isNodeError", () => {
  it("matches on the error code", () => {
    const cause = Object.assign(new Error("exists"), { code: "EEXIST" });
    expect(isNodeError(cause, "EEXIST")).toBe(true);
    expect(isNodeError(cause, "ENOENT")).toBe(false);
    expect(isNodeError({ code: "EEXIST" }, "EEXIST")).toBe(false);
  });
});
