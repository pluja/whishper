import { describe, expect, it } from "vitest";
import {
  groupIntoSections,
  matchesSearch,
  nextPickerIndex,
  typeaheadIndex,
} from "./picker";

describe("nextPickerIndex", () => {
  it("moves with the arrows and wraps", () => {
    expect(nextPickerIndex(0, "ArrowDown", 3)).toBe(1);
    expect(nextPickerIndex(2, "ArrowDown", 3)).toBe(0);
    expect(nextPickerIndex(0, "ArrowUp", 3)).toBe(2);
    expect(nextPickerIndex(-1, "ArrowDown", 3)).toBe(0);
  });
  it("jumps to the first and last option", () => {
    expect(nextPickerIndex(1, "Home", 3)).toBe(0);
    expect(nextPickerIndex(1, "End", 3)).toBe(2);
  });
  it("pages by ten options and stops at the ends", () => {
    expect(nextPickerIndex(0, "PageDown", 25)).toBe(10);
    expect(nextPickerIndex(20, "PageDown", 25)).toBe(24);
    expect(nextPickerIndex(15, "PageUp", 25)).toBe(5);
    expect(nextPickerIndex(3, "PageUp", 25)).toBe(0);
    expect(nextPickerIndex(-1, "PageDown", 25)).toBe(10);
  });
  it("returns null for an empty list or an unrelated key", () => {
    expect(nextPickerIndex(0, "ArrowDown", 0)).toBeNull();
    expect(nextPickerIndex(0, "PageDown", 0)).toBeNull();
    expect(nextPickerIndex(0, "a", 3)).toBeNull();
  });
});

describe("typeaheadIndex", () => {
  const labels = ["Tiny", "Base", "Small", "Medium", "Large v2", "Large v3"];

  it("finds the next option starting with the typed text", () => {
    expect(typeaheadIndex(labels, 0, "m")).toBe(3);
    expect(typeaheadIndex(labels, 0, "large v3")).toBe(5);
  });
  it("cycles through options sharing a repeated first letter", () => {
    expect(typeaheadIndex(labels, 4, "l")).toBe(5);
    expect(typeaheadIndex(labels, 5, "l")).toBe(4);
    expect(typeaheadIndex(labels, 4, "ll")).toBe(5);
  });
  it("keeps the current option while it still matches a longer prefix", () => {
    expect(typeaheadIndex(labels, 4, "la")).toBe(4);
  });
  it("ignores case and accents", () => {
    expect(typeaheadIndex(["Español", "Ελληνικά"], -1, "E")).toBe(0);
    expect(typeaheadIndex(["Ítaliano"], -1, "it")).toBe(0);
  });
  it("returns null without a match or typed text", () => {
    expect(typeaheadIndex(labels, 0, "z")).toBeNull();
    expect(typeaheadIndex(labels, 0, "")).toBeNull();
    expect(typeaheadIndex([], -1, "a")).toBeNull();
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

describe("groupIntoSections", () => {
  it("puts consecutive options of the same group in one section", () => {
    const options = ["auto", "en", "es", "af", "sq"];
    const group = (option: string) =>
      option === "auto" ? "" : option.startsWith("e") ? "Common" : "Other";
    expect(groupIntoSections(options, group)).toEqual([
      { label: "", entries: [{ option: "auto", index: 0 }] },
      {
        label: "Common",
        entries: [
          { option: "en", index: 1 },
          { option: "es", index: 2 },
        ],
      },
      {
        label: "Other",
        entries: [
          { option: "af", index: 3 },
          { option: "sq", index: 4 },
        ],
      },
    ]);
  });
  it("returns one unlabelled section without a group function", () => {
    expect(groupIntoSections(["a", "b"])).toEqual([
      {
        label: "",
        entries: [
          { option: "a", index: 0 },
          { option: "b", index: 1 },
        ],
      },
    ]);
  });
  it("returns no sections for no options", () => {
    expect(groupIntoSections([])).toEqual([]);
  });
});
