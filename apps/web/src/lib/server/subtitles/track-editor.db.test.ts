import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { pool } from "$lib/server/db";
import { seedProject, seedTrack } from "$lib/server/db/testing/fixtures";
import {
  TrackLockedByTranscription,
  updateTrackForUser,
} from "$lib/server/subtitles/track-editor";

const WORDS = [{ id: "word-1", text: "Kept" }];

describe("updateTrackForUser", () => {
  it("replaces the cues with the editor's ids and keeps words of unchanged text", async () => {
    const project = await seedProject();
    const trackId = await seedTrack(project.projectId);
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

  describe("while a transcription runs on the project", () => {
    async function seedTrackWithCue() {
      const project = await seedProject();
      const trackId = await seedTrack(project.projectId);
      const cueId = randomUUID();
      await pool.query(
        `insert into cues (id, track_id, position, start_us, end_us, text)
         values ($1, $2, 0, 0, 1000, 'Before')`,
        [cueId, trackId],
      );
      return { ...project, trackId, cueId };
    }

    async function startRun(projectId: string, userId: string, status: string) {
      await pool.query(
        `insert into transcription_runs (project_id, status, adapter_id, model_id, created_by)
         values ($1, $2, 'whisperx', 'small', $3)`,
        [projectId, status, userId],
      );
    }

    function edit(cueId: string) {
      return {
        revision: 0,
        cues: [
          { id: cueId, position: 0, startUs: 0, endUs: 1000, text: "After" },
        ],
      };
    }

    async function storedState(trackId: string) {
      const result = await pool.query<{ text: string; revision: number }>(
        `select c.text, t.revision
           from cues c join subtitle_tracks t on t.id = c.track_id
          where c.track_id = $1`,
        [trackId],
      );
      return result.rows;
    }

    it.each(["queued", "running"])(
      "refuses the save and writes nothing while the run is %s",
      async (status) => {
        const seeded = await seedTrackWithCue();
        await startRun(seeded.projectId, seeded.userId, status);

        await expect(
          updateTrackForUser(
            seeded.projectId,
            seeded.trackId,
            seeded.userId,
            edit(seeded.cueId),
          ),
        ).rejects.toBeInstanceOf(TrackLockedByTranscription);
        expect(await storedState(seeded.trackId)).toEqual([
          { text: "Before", revision: 0 },
        ]);
      },
    );

    it("saves again once the run has finished", async () => {
      const seeded = await seedTrackWithCue();
      await startRun(seeded.projectId, seeded.userId, "completed");

      const revision = await updateTrackForUser(
        seeded.projectId,
        seeded.trackId,
        seeded.userId,
        edit(seeded.cueId),
      );

      expect(revision).toBe(1);
      expect(await storedState(seeded.trackId)).toEqual([
        { text: "After", revision: 1 },
      ]);
    });
  });
});
