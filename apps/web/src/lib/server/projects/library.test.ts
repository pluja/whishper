import { describe, expect, it } from "vitest";

import {
  normalizeProjectTitle,
  parseProjectLibrarySearch,
} from "$lib/server/projects/library";
import {
  PROJECT_SEARCH_MAX_LENGTH,
  PROJECT_TITLE_MAX_LENGTH,
} from "$lib/shared/limits";

describe("project library inputs", () => {
  it("parses title search and optional subtitle scope", () => {
    expect(
      parseProjectLibrarySearch(new URLSearchParams("q=%20rough+cut%20")),
    ).toEqual({
      query: "rough cut",
      includeSubtitles: false,
    });
    expect(
      parseProjectLibrarySearch(
        new URLSearchParams("q=interview&scope=subtitles"),
      ),
    ).toEqual({ query: "interview", includeSubtitles: true });
  });

  it("bounds search input without treating punctuation as syntax", () => {
    const query = `${"a".repeat(PROJECT_SEARCH_MAX_LENGTH)}%_`;
    expect(
      parseProjectLibrarySearch(new URLSearchParams({ q: query })),
    ).toEqual({
      query: "a".repeat(PROJECT_SEARCH_MAX_LENGTH),
      includeSubtitles: false,
    });
  });

  it("normalizes project titles and enforces their storage limit", () => {
    expect(normalizeProjectTitle("  Assembly\n  cut  ")).toBe("Assembly cut");
    expect(normalizeProjectTitle("e\u0301pisode")).toBe("épisode");
    expect(
      normalizeProjectTitle("x".repeat(PROJECT_TITLE_MAX_LENGTH + 1)),
    ).toHaveLength(PROJECT_TITLE_MAX_LENGTH);
  });

  it("never cuts an emoji in half at the title limit", () => {
    const fill = "x".repeat(PROJECT_TITLE_MAX_LENGTH - 1);
    expect(normalizeProjectTitle(`${fill}\u{1F600}`)).toBe(fill);
  });
});
