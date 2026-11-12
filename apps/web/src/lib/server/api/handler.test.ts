import type { RequestEvent } from "@sveltejs/kit";
import { describe, expect, it, vi } from "vitest";

import { apiEndpoint, readJsonBody } from "#lib/server/api/handler.ts";
import { conflict } from "#lib/server/http/errors.ts";
import { z } from "zod";

function eventWith(
  apiScope: "read" | "write" | null,
  method = "GET",
): RequestEvent {
  return {
    request: new Request("https://anysub.example/api/v1/projects", { method }),
    locals: {
      user: apiScope ? { id: "user-1" } : null,
      session: null,
      apiScope,
    },
  } as unknown as RequestEvent;
}

describe("apiEndpoint", () => {
  it("refuses writes with a read-only token", async () => {
    const work = vi.fn(() => new Response("done"));

    const response = await apiEndpoint(eventWith("read", "POST"), work);

    expect(response.status).toBe(403);
    expect(work).not.toHaveBeenCalled();
  });

  it("answers client failures with their message", async () => {
    const response = await apiEndpoint(eventWith("write", "POST"), () => {
      throw conflict("Already running.");
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: { code: "conflict", message: "Already running." },
    });
  });

  it("logs unexpected failures and answers without their details", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await apiEndpoint(eventWith("read"), () => {
      throw new Error("database path /data/secret");
    });

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  // An encoded path such as /api/%761/projects reaches the v1 routes without
  // the hooks treating it as the API, so a browser session may be loaded.
  it("refuses a browser session that reached it", async () => {
    const event = eventWith(null);
    event.locals.user = { id: "user-1" } as App.Locals["user"];

    const response = await apiEndpoint(event, () => new Response());

    expect(response.status).toBe(401);
  });

  it("needs a token", async () => {
    const response = await apiEndpoint(eventWith(null), () => new Response());

    expect(response.status).toBe(401);
  });
});

describe("readJsonBody", () => {
  const schema = z.strictObject({ model: z.string() });

  it("names the field that is wrong", async () => {
    await expect(
      readJsonBody(
        new Request("https://x.test", { method: "POST", body: '{"model": 1}' }),
        schema,
      ),
    ).rejects.toThrow("model:");
  });

  it("refuses a body that is not JSON", async () => {
    await expect(
      readJsonBody(
        new Request("https://x.test", { method: "POST", body: "model=x" }),
        schema,
      ),
    ).rejects.toThrow("Send a JSON body.");
  });
});
