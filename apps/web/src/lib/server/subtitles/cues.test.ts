import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";

import { insertCues } from "./cues";

function fakeClient() {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  return { query, client: { query } as unknown as PoolClient };
}

describe("insertCues", () => {
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
