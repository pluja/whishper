import { afterEach, describe, expect, it, vi } from "vitest";

import { db } from "$lib/server/db";

import { GET } from "./+server";

describe("health route", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reports ok when the database answers", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("returns 503 JSON when the database query fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(db, "get").mockImplementation(() => {
      throw new Error("disk I/O error");
    });

    const response = GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
  });
});
