import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("$lib/server/db", () => ({ pool: { query } }));

import { GET } from "./+server";

describe("health route", () => {
  beforeEach(() => {
    query.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("reports ok when the database answers", async () => {
    query.mockResolvedValue({ rows: [] });
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("returns 503 JSON when the database query fails", async () => {
    query.mockRejectedValue(new Error("connection refused"));
    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
  });
});
