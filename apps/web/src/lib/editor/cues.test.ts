import { describe, expect, it } from "vitest";

import {
  cueIssues,
  deleteCue,
  insertCueAfter,
  mergeCueWithNext,
  nearestWordBoundary,
  nudgeCue,
  retimeCue,
  splitCue,
  type EditorCue,
} from "./cues";

function cue(
  id: string,
  startSeconds: number,
  endSeconds: number,
  text = "hello world",
): EditorCue {
  return {
    id,
    position: 0,
    start_us: startSeconds * 1_000_000,
    end_us: endSeconds * 1_000_000,
    text,
  };
}

function track(...items: EditorCue[]): EditorCue[] {
  return items.map((item, position) => ({ ...item, position }));
}

describe("cueIssues", () => {
  it("reports no issues for a readable cue", () => {
    expect(cueIssues([cue("a", 0, 2)], 0, 42)).toEqual([]);
  });

  it("flags empty, long, short, fast and overlapping cues", () => {
    const cues = track(
      cue("a", 0, 1.2),
      cue("b", 1, 1.3, "this line is far too long for the configured limit"),
    );
    expect(cueIssues(cues, 1, 20)).toEqual([
      "Over 20 characters",
      "Under 0.5 seconds",
      "Over 20 CPS",
      "Overlaps previous cue",
    ]);
    expect(cueIssues([cue("a", 0, 8, "  ")], 0, 42)).toEqual([
      "Empty cue",
      "Over 7 seconds",
    ]);
  });

  it("reports a zero length cue without a rate check", () => {
    expect(cueIssues([cue("a", 1, 1)], 0, 42)).toEqual(["No duration"]);
  });
});

describe("nearestWordBoundary", () => {
  it("keeps a position that is already whitespace", () => {
    expect(nearestWordBoundary("ab cd", 2)).toBe(2);
  });

  it("finds the closest whitespace, preferring the earlier side on ties", () => {
    expect(nearestWordBoundary("ab cd ef", 4)).toBe(5);
    expect(nearestWordBoundary("abc def", 4)).toBe(3);
    expect(nearestWordBoundary("a b c", 2)).toBe(1);
  });

  it("returns -1 when there is no word boundary", () => {
    expect(nearestWordBoundary("abcdef", 3)).toBe(-1);
  });
});

describe("splitCue", () => {
  it("splits at the playhead and the cursor word boundary", () => {
    const cues = track(cue("a", 0, 4, "one two three"), cue("b", 4, 5));
    const result = splitCue(cues, 0, {
      playbackUs: 1_500_000,
      cursorPosition: 4,
      newId: "new",
    });
    expect(result).toEqual({
      cues: [
        { id: "a", position: 0, start_us: 0, end_us: 1_500_000, text: "one" },
        {
          id: "new",
          position: 1,
          start_us: 1_500_000,
          end_us: 4_000_000,
          text: "two three",
        },
        { ...cues[1], position: 2 },
      ],
      selectedCueId: "new",
    });
    expect(cues[0].text).toBe("one two three");
  });

  it("falls back to the midpoint when the playhead is near an edge", () => {
    const result = splitCue(track(cue("a", 0, 2, "one two")), 0, {
      playbackUs: 50_000,
      newId: "new",
    });
    expect("cues" in result && result.cues[1].start_us).toBe(1_000_000);
  });

  it("refuses cues that are too short or have no word boundary", () => {
    expect(
      splitCue(track(cue("a", 0, 0.1)), 0, { playbackUs: 0, newId: "n" }),
    ).toEqual({ message: "This cue is too short to split." });
    expect(
      splitCue(track(cue("a", 0, 2, "word")), 0, {
        playbackUs: 0,
        newId: "n",
      }),
    ).toEqual({
      message: "Place the text cursor between words before splitting.",
    });
  });
});

describe("mergeCueWithNext", () => {
  it("joins text and extends the end time", () => {
    const cues = track(cue("a", 0, 1, " one "), cue("b", 1, 3, "two"));
    expect(mergeCueWithNext(cues, 0)).toEqual({
      cues: [{ ...cues[0], end_us: 3_000_000, text: "one two" }],
    });
    expect(cues).toHaveLength(2);
  });
});

describe("insertCueAfter", () => {
  it("fills the gap before the next cue, capped at two seconds", () => {
    const cues = track(cue("a", 0, 1), cue("b", 1.5, 2));
    const result = insertCueAfter(cues, 0, {
      sourceDurationUs: 0,
      newId: "new",
    });
    expect(result.selectedCueId).toBe("new");
    expect(result.cues.map((item) => item.id)).toEqual(["a", "new", "b"]);
    expect(result.cues[1]).toEqual({
      id: "new",
      position: 1,
      start_us: 1_000_000,
      end_us: 1_500_000,
      text: "",
    });
    expect(result.cues[2].position).toBe(2);
  });

  it("is bounded by the source duration after the last cue", () => {
    const result = insertCueAfter(track(cue("a", 0, 1)), 0, {
      sourceDurationUs: 1_200_000,
      newId: "new",
    });
    expect(result.cues[1].end_us).toBe(1_200_000);
  });

  it("starts an empty track at zero", () => {
    const result = insertCueAfter([], -1, {
      sourceDurationUs: 0,
      newId: "new",
    });
    expect(result.cues).toEqual([
      { id: "new", position: 0, start_us: 0, end_us: 2_000_000, text: "" },
    ]);
  });
});

describe("deleteCue", () => {
  it("selects the cue that takes the deleted position", () => {
    const cues = track(cue("a", 0, 1), cue("b", 1, 2), cue("c", 2, 3));
    const result = deleteCue(cues, 1);
    expect(result.cues.map((item) => [item.id, item.position])).toEqual([
      ["a", 0],
      ["c", 1],
    ]);
    expect(result.selectedCueId).toBe("c");
  });

  it("selects the previous cue when deleting the last one, or none", () => {
    expect(deleteCue(track(cue("a", 0, 1), cue("b", 1, 2)), 1)).toMatchObject({
      selectedCueId: "a",
    });
    expect(deleteCue(track(cue("a", 0, 1)), 0)).toEqual({
      cues: [],
      selectedCueId: null,
    });
  });
});

describe("nudgeCue", () => {
  it("shifts both edges and keeps the selection", () => {
    const result = nudgeCue(track(cue("a", 1, 2)), 0, 100);
    expect(result).toEqual({
      cues: [{ ...cue("a", 1.1, 2.1), position: 0 }],
    });
  });

  it("clamps at zero while keeping the duration", () => {
    const result = nudgeCue(track(cue("a", 0.05, 1)), 0, -100);
    expect(result.cues[0]).toMatchObject({ start_us: 0, end_us: 950_000 });
  });
});

describe("retimeCue", () => {
  it("replaces the timing of one cue", () => {
    const cues = track(cue("a", 0, 1), cue("b", 1, 2));
    expect(
      retimeCue(cues, 1, { start_us: 1_200_000, end_us: 2_500_000 }).cues[1],
    ).toMatchObject({ start_us: 1_200_000, end_us: 2_500_000 });
    expect(cues[1].start_us).toBe(1_000_000);
  });
});
