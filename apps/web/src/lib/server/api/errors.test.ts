import { describe, expect, it } from "vitest";

import { apiError } from "#lib/server/api/errors.ts";

async function codeOf(status: number): Promise<string> {
  const body = (await apiError(status, "Message.").json()) as {
    error: { code: string };
  };
  return body.error.code;
}

describe("apiError", () => {
  it("names known statuses", async () => {
    expect(await codeOf(404)).toBe("not_found");
    expect(await codeOf(413)).toBe("payload_too_large");
  });

  it("treats other client statuses as invalid requests", async () => {
    expect(await codeOf(422)).toBe("invalid_request");
    expect(await codeOf(429)).toBe("invalid_request");
  });

  it("treats server statuses as internal errors", async () => {
    expect(await codeOf(503)).toBe("internal_error");
  });
});
