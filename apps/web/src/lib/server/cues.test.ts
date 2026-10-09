import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";

import { insertCues } from "./cues";

function fakeClient() {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  return { query, client: { query } as unknown as PoolClient };
}

describe("insertCues", () => {
  it("inserts every cue in one statement with positions in order", async () => {
    const { query, client } = fakeClient();

    await insertCues(client, "track-1", [
      { startUs: 0, endUs: 10, text: "one", words: [] },
      { id: "cue-id", startUs: 10, endUs: 20, text: "two", words: [{ a: 1 }] },
    ]);

    expect(query).toHaveBeenCalledOnce();
    const [sql, [trackId, payload]] = query.mock.calls[0];
    expect(sql).toContain("jsonb_to_recordset");
    expect(trackId).toBe("track-1");
    expect(JSON.parse(payload)).toEqual([
      {
        id: null,
        position: 0,
        start_us: 0,
        end_us: 10,
        text: "one",
        words: [],
      },
      {
        id: "cue-id",
        position: 1,
        start_us: 10,
        end_us: 20,
        text: "two",
        words: [{ a: 1 }],
      },
    ]);
  });

  it("does not query when there are no cues", async () => {
    const { query, client } = fakeClient();

    await insertCues(client, "track-1", []);

    expect(query).not.toHaveBeenCalled();
  });
});
