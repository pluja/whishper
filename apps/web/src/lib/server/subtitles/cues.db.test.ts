import { describe, expect, it } from "vitest";

import { pool } from "$lib/server/db";
import { seedProject, seedTrack } from "$lib/server/db/testing/fixtures";
import { withTransaction } from "$lib/server/db/transaction";
import { insertCues, listTrackCues } from "$lib/server/subtitles/cues";
import { isUuid } from "$lib/shared/uuid";

const FIRST_CUE_ID = "6f1c1a52-8a4e-4c1b-9d6e-2f4b8f0a7c31";
const SECOND_CUE_ID = "0b7e2d94-3c5a-4f8e-a1d2-9e6c4b3a2f10";

async function seededTrack(): Promise<string> {
  const project = await seedProject();
  return seedTrack(project.projectId);
}

describe("insertCues and listTrackCues", () => {
  it("stores provided ids with positions in order and reads them back", async () => {
    const trackId = await seededTrack();

    await withTransaction((client) =>
      insertCues(client, trackId, {
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
      }),
    );

    await expect(
      listTrackCues(pool, trackId, { includeWords: true }),
    ).resolves.toEqual([
      {
        id: FIRST_CUE_ID,
        position: 0,
        startUs: 0,
        endUs: 10,
        text: "one",
        words: [],
      },
      {
        id: SECOND_CUE_ID,
        position: 1,
        startUs: 10,
        endUs: 20,
        text: "two",
        words: [{ a: 1 }],
      },
    ]);
  });

  it("generates ids when asked and leaves words out by default", async () => {
    const trackId = await seededTrack();

    await withTransaction((client) =>
      insertCues(client, trackId, {
        ids: "generate",
        cues: [
          {
            startUs: 0,
            endUs: 5_000_000_000,
            text: "one",
            words: [{ a: 1 }],
          },
        ],
      }),
    );

    const [cue] = await listTrackCues(pool, trackId);
    expect(isUuid(cue.id)).toBe(true);
    expect(cue).toEqual({
      id: cue.id,
      position: 0,
      startUs: 0,
      endUs: 5_000_000_000,
      text: "one",
    });
  });
});
