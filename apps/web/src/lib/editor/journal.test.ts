import { describe, expect, it } from "vitest";

import { parseCueJournal } from "./journal";

const validCue = { id: "a", start_us: 0, end_us: 1_000_000, text: "hello" };

function serialized(cues: unknown[], revision: unknown = 3): string {
  return JSON.stringify({ revision, cues, updatedAt: 1 });
}

describe("parseCueJournal", () => {
  it("returns cues with positions reassigned in order", () => {
    const second = { ...validCue, id: "b", position: 9 };
    expect(parseCueJournal(serialized([validCue, second]))).toEqual({
      revision: 3,
      cues: [
        { ...validCue, position: 0 },
        { ...second, position: 1 },
      ],
    });
  });

  it("drops fields that are not part of a cue", () => {
    const parsed = parseCueJournal(
      serialized([{ ...validCue, extra: "<script>" }]),
    );
    expect(parsed?.cues[0]).not.toHaveProperty("extra");
  });

  it.each([
    ["malformed JSON", "{"],
    ["a non object", "[]"],
    ["a missing revision", JSON.stringify({ cues: [] })],
    ["a fractional revision", serialized([], 1.5)],
    ["cues that are not an array", serialized({} as unknown as unknown[])],
    ["a null cue", serialized([null])],
    ["a missing id", serialized([{ ...validCue, id: "" }])],
    ["a non string text", serialized([{ ...validCue, text: 5 }])],
    ["a negative start", serialized([{ ...validCue, start_us: -1 }])],
    ["a fractional end", serialized([{ ...validCue, end_us: 1.5 }])],
    ["a string time", serialized([{ ...validCue, start_us: "0" }])],
    ["an end before the start", serialized([{ ...validCue, start_us: 2e6 }])],
  ])("rejects %s", (_, value) => {
    expect(parseCueJournal(value)).toBeNull();
  });
});
