import { describe, expect, it } from "vitest";

import { user } from "#lib/server/auth/schema.ts";
import { db } from "#lib/server/db/index.ts";

import { auth } from "./auth";

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
    expect(db.select().from(user).all()).toEqual([]);
  });
});
