import { randomUUID } from "node:crypto";

import { asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "$lib/server/db";
import { cues, subtitleTracks, transcriptionRuns } from "$lib/server/db/schema";
import { seedProject, seedTrack } from "$lib/server/db/testing/fixtures";
import {
  TrackLockedByTranscription,
  TrackValidationError,
  updateTrackForUser,
} from "$lib/server/subtitles/track-editor";

const WORDS = [{ id: "word-1", text: "Kept" }];

function seedCue(trackId: string, position: number, text: string): string {
  const id = randomUUID();
  db.insert(cues)
    .values({
      id,
      trackId,
      position,
      startUs: position * 1000,
      endUs: position * 1000 + 1000,
      text,
      words: WORDS,
    })
    .run();
  return id;
}

describe("updateTrackForUser", () => {
  it("replaces the cues with the editor's ids and keeps words of unchanged text", () => {
    const project = seedProject();
    const trackId = seedTrack(project.projectId);
    const keptId = seedCue(trackId, 0, "Kept");
    const editedId = seedCue(trackId, 1, "Old");
    const addedId = randomUUID();

    const revision = updateTrackForUser(
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
    expect(
      db
        .select({ id: cues.id, text: cues.text, words: cues.words })
        .from(cues)
        .where(eq(cues.trackId, trackId))
        .orderBy(asc(cues.position))
        .all(),
    ).toEqual([
      { id: addedId, text: "New", words: [] },
      { id: keptId, text: "Kept", words: WORDS },
      { id: editedId, text: "Edited", words: [] },
    ]);
  });

  it("refuses a cue id that belongs to another track", () => {
    const project = seedProject();
    const trackId = seedTrack(project.projectId);
    const foreignId = seedCue(seedTrack(project.projectId), 0, "Other");

    expect(() =>
      updateTrackForUser(project.projectId, trackId, project.userId, {
        revision: 0,
        cues: [
          { id: foreignId, position: 0, startUs: 0, endUs: 500, text: "Mine" },
        ],
      }),
    ).toThrow(TrackValidationError);

    expect(
      db
        .select({ text: cues.text })
        .from(cues)
        .where(eq(cues.id, foreignId))
        .get()?.text,
    ).toBe("Other");
  });

  describe("while a transcription runs on the project", () => {
    function seedTrackWithCue() {
      const project = seedProject();
      const trackId = seedTrack(project.projectId);
      const cueId = seedCue(trackId, 0, "Before");
      return { ...project, trackId, cueId };
    }

    function startRun(
      projectId: string,
      userId: string,
      status: "queued" | "running" | "completed",
    ) {
      db.insert(transcriptionRuns)
        .values({
          projectId,
          status,
          adapterId: "whisperx",
          modelId: "small",
          createdBy: userId,
        })
        .run();
    }

    function edit(cueId: string) {
      return {
        revision: 0,
        cues: [
          { id: cueId, position: 0, startUs: 0, endUs: 1000, text: "After" },
        ],
      };
    }

    function storedState(trackId: string) {
      return db
        .select({ text: cues.text, revision: subtitleTracks.revision })
        .from(cues)
        .innerJoin(subtitleTracks, eq(subtitleTracks.id, cues.trackId))
        .where(eq(cues.trackId, trackId))
        .all();
    }

    it.each(["queued", "running"] as const)(
      "refuses the save and writes nothing while the run is %s",
      (status) => {
        const seeded = seedTrackWithCue();
        startRun(seeded.projectId, seeded.userId, status);

        expect(() =>
          updateTrackForUser(
            seeded.projectId,
            seeded.trackId,
            seeded.userId,
            edit(seeded.cueId),
          ),
        ).toThrow(TrackLockedByTranscription);
        expect(storedState(seeded.trackId)).toEqual([
          { text: "Before", revision: 0 },
        ]);
      },
    );

    it("saves again once the run has finished", () => {
      const seeded = seedTrackWithCue();
      startRun(seeded.projectId, seeded.userId, "completed");

      const revision = updateTrackForUser(
        seeded.projectId,
        seeded.trackId,
        seeded.userId,
        edit(seeded.cueId),
      );

      expect(revision).toBe(1);
      expect(storedState(seeded.trackId)).toEqual([
        { text: "After", revision: 1 },
      ]);
    });
  });
});
