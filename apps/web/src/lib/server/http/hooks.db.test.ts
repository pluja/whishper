import type { RequestEvent } from "@sveltejs/kit";
import { describe, expect, it, vi } from "vitest";

import { createApiToken } from "#lib/server/auth/api-tokens.ts";
import { seedProject } from "#lib/server/db/testing/fixtures.ts";
import { authenticateApiTokens, loadSession } from "#lib/server/http/hooks.ts";

function eventFor(
  path: string,
  headers: HeadersInit = {},
  method = "GET",
): RequestEvent {
  const url = new URL(path, "https://anysub.example");
  return {
    url,
    request: new Request(url, { headers, method }),
    locals: { user: null, session: null, apiScope: null },
  } as RequestEvent;
}

const resolved = new Response("resolved");
const resolve = vi.fn(async () => resolved);

function tokenFor(scope: "read" | "write") {
  const { userId } = seedProject();
  return {
    userId,
    token: createApiToken(userId, { name: "Test", scope, lifetimeDays: null }),
  };
}

describe("API token authentication", () => {
  it("answers the public API with a JSON error when no token is sent", async () => {
    const response = await authenticateApiTokens({
      event: eventFor("/api/v1/projects"),
      resolve,
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: "unauthorized" },
    });
  });

  it("serves the API description without a token", async () => {
    const response = await authenticateApiTokens({
      event: eventFor("/api/v1/openapi.json"),
      resolve,
    });

    expect(response).toBe(resolved);
  });

  it("acts as the token's user with its scope", async () => {
    const { userId, token } = tokenFor("read");
    const event = eventFor("/api/v1/projects", {
      authorization: `Bearer ${token}`,
    });

    await authenticateApiTokens({ event, resolve });

    expect(event.locals.user?.id).toBe(userId);
    expect(event.locals.apiScope).toBe("read");
  });

  it("refuses resumable uploads with a read-only token", async () => {
    const { token } = tokenFor("read");

    const response = await authenticateApiTokens({
      event: eventFor(
        "/api/uploads",
        { authorization: `Bearer ${token}` },
        "POST",
      ),
      resolve,
    });

    expect(response.status).toBe(403);
  });

  it("leaves pages and session uploads to the browser session", async () => {
    const event = eventFor("/api/uploads");

    const response = await authenticateApiTokens({ event, resolve });

    expect(response).toBe(resolved);
    expect(event.locals.apiScope).toBeNull();
  });

  it("ignores browser cookies on the public API", async () => {
    const event = eventFor("/api/v1/projects", { cookie: "anysub.session=x" });

    await loadSession({ event, resolve });

    expect(event.locals.user).toBeNull();
  });
});
