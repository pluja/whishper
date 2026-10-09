import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { pool } from "$lib/server/db";
import { seedProject } from "$lib/server/db/testing/fixtures";
import { updateTrackForUser } from "$lib/server/subtitle-editor";

const WORDS = [{ id: "word-1", text: "Kept" }];

describe("updateTrackForUser", () => {
  it("replaces the cues with the editor's ids and keeps words of unchanged text", async () => {
    const project = await seedProject();
    const track = await pool.query<{ id: string }>(
      `insert into subtitle_tracks (project_id, name, language)
       values ($1, 'Track', 'en') returning id`,
      [project.projectId],
    );
    const trackId = track.rows[0].id;
    const keptId = randomUUID();
    const editedId = randomUUID();
    await pool.query(
      `insert into cues (id, track_id, position, start_us, end_us, text, words)
       values ($1, $3, 0, 0, 1000, 'Kept', $4), ($2, $3, 1, 1000, 2000, 'Old', $4)`,
      [keptId, editedId, trackId, JSON.stringify(WORDS)],
    );
    const addedId = randomUUID();

    const revision = await updateTrackForUser(
      project.projectId,
      trackId,
      project.userId,
      {
        revision: 0,
        cues: [
          { id: addedId, position: 0, startUs: 0, endUs: 500, text: "New" },
          { id: keptId, position: 1, startUs: 500, endUs: 1000, text: "Kept" },
          {
            id: editedId,
            position: 2,
            startUs: 1000,
            endUs: 2000,
            text: "Edited",
          },
        ],
      },
    );

    expect(revision).toBe(1);
    const stored = await pool.query<{
      id: string;
      text: string;
      words: unknown[];
    }>(
      `select id, text, words from cues where track_id = $1 order by position`,
      [trackId],
    );
    expect(stored.rows).toEqual([
      { id: addedId, text: "New", words: [] },
      { id: keptId, text: "Kept", words: WORDS },
      { id: editedId, text: "Edited", words: [] },
    ]);
  });
});
