import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";

import { insertCues } from "./cues";

const FIRST_CUE_ID = "6f1c1a52-8a4e-4c1b-9d6e-2f4b8f0a7c31";
const SECOND_CUE_ID = "0b7e2d94-3c5a-4f8e-a1d2-9e6c4b3a2f10";

function fakeClient() {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  return { query, client: { query } as unknown as PoolClient };
}

function insertedRows(query: ReturnType<typeof vi.fn>) {
  const [sql, [trackId, payload]] = query.mock.calls[0];
  return { sql, trackId, rows: JSON.parse(payload) };
}

describe("insertCues", () => {
  it("inserts every cue in one statement with positions in order", async () => {
    const { query, client } = fakeClient();

    await insertCues(client, "track-1", {
      ids: "provided",
      cues: [
        { id: FIRST_CUE_ID, startUs: 0, endUs: 10, text: "one", words: [] },
        {
          id: SECOND_CUE_ID,
          startUs: 10,
          endUs: 20,
          text: "two",
          words: [{ a: 1 }],
        },
      ],
    });

    expect(query).toHaveBeenCalledOnce();
    const { sql, trackId, rows } = insertedRows(query);
    expect(sql).toContain("jsonb_to_recordset");
    expect(trackId).toBe("track-1");
    expect(rows).toEqual([
      {
        id: FIRST_CUE_ID,
        position: 0,
        start_us: 0,
        end_us: 10,
        text: "one",
        words: [],
      },
      {
        id: SECOND_CUE_ID,
        position: 1,
        start_us: 10,
        end_us: 20,
        text: "two",
        words: [{ a: 1 }],
      },
    ]);
  });

  it("leaves ids to the database when asked to generate them", async () => {
    const { query, client } = fakeClient();
    const workerCue = {
      id: "cue-000001",
      startUs: 0,
      endUs: 10,
      text: "one",
      words: [],
    };

    await insertCues(client, "track-1", { ids: "generate", cues: [workerCue] });

    expect(insertedRows(query).rows[0].id).toBeNull();
  });

  it("refuses provided ids that are not UUIDs", async () => {
    const { query, client } = fakeClient();

    await expect(
      insertCues(client, "track-1", {
        ids: "provided",
        cues: [{ id: "cue-1", startUs: 0, endUs: 10, text: "one", words: [] }],
      }),
    ).rejects.toThrow("Cue ids must be UUIDs.");
    expect(query).not.toHaveBeenCalled();
  });

  it("does not query when there are no cues", async () => {
    const { query, client } = fakeClient();

    await insertCues(client, "track-1", { ids: "generate", cues: [] });

    expect(query).not.toHaveBeenCalled();
  });
});
