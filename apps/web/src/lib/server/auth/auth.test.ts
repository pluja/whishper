import { describe, expect, it, vi } from "vitest";

import { auth } from "./auth";

// An unreachable database, so a regression fails here instead of creating an
// account in whatever database the test container is wired to.
vi.mock("$lib/server/env", async (importOriginal) => {
  const original = await importOriginal<typeof import("$lib/server/env")>();
  return {
    ...original,
    privateEnv: {
      ...original.privateEnv,
      databaseUrl: "postgresql://unreachable@127.0.0.1:1/unreachable",
    },
  };
});

describe("better-auth configuration", () => {
  it("rejects public sign-up", async () => {
    const response = await auth.handler(
      new Request(`${auth.options.baseURL}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Mallory",
          email: "mallory@example.com",
          password: "a-long-enough-password",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "EMAIL_PASSWORD_SIGN_UP_DISABLED",
    });
  });
});
