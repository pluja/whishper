import { describe, expect, it } from "vitest";

import { parseTrackUpdate } from "$lib/server/subtitles/track-editor";

describe("subtitle track updates", () => {
  it("normalizes positions and line endings", () => {
    expect(
      parseTrackUpdate({
        revision: 3,
        cues: [
          {
            id: "b14d765a-0cb2-4fa8-af80-c563ab57c959",
            startUs: 100,
            endUs: 200,
            text: "First\r\nline",
          },
        ],
      }),
    ).toEqual({
      revision: 3,
      cues: [
        {
          id: "b14d765a-0cb2-4fa8-af80-c563ab57c959",
          position: 0,
          startUs: 100,
          endUs: 200,
          text: "First\nline",
        },
      ],
    });
  });

  it("rejects duplicate cue identities and invalid timing", () => {
    const cue = {
      id: "b14d765a-0cb2-4fa8-af80-c563ab57c959",
      startUs: 200,
      endUs: 100,
      text: "Invalid",
    };
    expect(() => parseTrackUpdate({ revision: 0, cues: [cue] })).toThrow(
      "invalid timing",
    );
    expect(() =>
      parseTrackUpdate({
        revision: 0,
        cues: [
          { ...cue, startUs: 0 },
          { ...cue, startUs: 0 },
        ],
      }),
    ).toThrow("unique");
  });

  it("rejects text that the database cannot store", () => {
    const cue = {
      id: "b14d765a-0cb2-4fa8-af80-c563ab57c959",
      startUs: 0,
      endUs: 100,
    };
    for (const text of ["before\u0000after", "lone \ud800 surrogate"]) {
      expect(() =>
        parseTrackUpdate({ revision: 0, cues: [{ ...cue, text }] }),
      ).toThrow("Cue 1 contains characters that cannot be saved");
    }
    expect(
      parseTrackUpdate({
        revision: 0,
        cues: [{ ...cue, text: "Emoji 🎬 and accents é" }],
      }).cues[0].text,
    ).toBe("Emoji 🎬 and accents é");
  });
});
