import { describe, expect, it } from "vitest";
import { matchesSearch, normalizeSearchText } from "./search";

describe("normalizeSearchText", () => {
  it("drops accents, case and surrounding space", () => {
    expect(normalizeSearchText("  Español ")).toBe("espanol");
    expect(normalizeSearchText("Ελληνικά")).toBe("ελληνικα");
  });
});

describe("matchesSearch", () => {
  it("matches any field as a case and accent insensitive substring", () => {
    expect(matchesSearch("espa", ["Spanish", "Español"])).toBe(true);
    expect(matchesSearch("ESPAÑ", ["Spanish", "Espanol"])).toBe(true);
    expect(matchesSearch("francais", ["French", "Français"])).toBe(true);
    expect(matchesSearch("  span ", ["Spanish"])).toBe(true);
    expect(matchesSearch("german", ["Spanish", "Español"])).toBe(false);
  });
  it("matches everything for an empty query", () => {
    expect(matchesSearch("", ["Spanish"])).toBe(true);
    expect(matchesSearch("   ", ["Spanish"])).toBe(true);
  });
});
