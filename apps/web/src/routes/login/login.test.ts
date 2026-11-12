import { isActionFailure, isRedirect } from "@sveltejs/kit";
import { APIError } from "better-auth/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { signInEmail } = vi.hoisted(() => ({ signInEmail: vi.fn() }));
vi.mock("#lib/server/auth/auth.ts", () => ({ auth: { api: { signInEmail } } }));
vi.mock("#lib/server/auth/instance.ts", () => ({
  isInstanceInitialized: () => true,
}));

import { actions } from "./+page.server";

type SignInEvent = Parameters<typeof actions.default>[0];

// The throttle outlives each test, so every test signs in as its own client.
async function signIn(client: string): Promise<unknown> {
  const body = new FormData();
  body.set("email", `${client}@example.test`);
  body.set("password", "a password to check");
  try {
    return await actions.default({
      request: new Request("http://localhost/login", { method: "POST", body }),
      getClientAddress: () => client,
    } as SignInEvent);
  } catch (cause) {
    return cause;
  }
}

async function rejectAfterATick(cause: unknown): Promise<never> {
  await new Promise((resolve) => setTimeout(resolve, 1));
  throw cause;
}

const wrongPassword = () =>
  rejectAfterATick(
    APIError.from("UNAUTHORIZED", {
      code: "INVALID_EMAIL_OR_PASSWORD",
      message: "Invalid email or password",
    }),
  );

function statusOf(result: unknown): number | undefined {
  if (isActionFailure(result) || isRedirect(result)) return result.status;
  return undefined;
}

describe("sign-in action", () => {
  beforeEach(() => {
    signInEmail.mockReset();
  });

  it("counts attempts that arrive together before any of them is checked", async () => {
    signInEmail.mockImplementation(wrongPassword);

    const results = await Promise.all(
      Array.from({ length: 8 }, () => signIn("together")),
    );

    expect(signInEmail).toHaveBeenCalledTimes(5);
    expect(results.map(statusOf)).toEqual([
      400, 400, 400, 400, 400, 429, 429, 429,
    ]);
  });

  it("lets a later failure through again after a successful sign-in", async () => {
    signInEmail.mockImplementation(wrongPassword);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await signIn("returning");
    }
    signInEmail.mockResolvedValueOnce({});
    expect(statusOf(await signIn("returning"))).toBe(303);

    expect(statusOf(await signIn("returning"))).toBe(400);
  });

  it("passes other errors on instead of blaming the password", async () => {
    const outage = new Error("database is locked");
    signInEmail.mockImplementation(() => rejectAfterATick(outage));

    expect(await signIn("outage")).toBe(outage);
  });
});
