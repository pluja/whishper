import { describe, expect, it } from "vitest";
import { LANGUAGES } from "#lib/shared/languages.ts";
import { FLAG_SOURCES } from "./flag-sources";

describe("FLAG_SOURCES", () => {
  it("bundles exactly the flags the language list uses", () => {
    const used = new Set(
      LANGUAGES.flatMap(({ flag }) => (flag === null ? [] : [flag])),
    );
    expect(new Set(Object.keys(FLAG_SOURCES))).toEqual(used);
  });

  it("maps every flag to its own file", () => {
    for (const [flag, source] of Object.entries(FLAG_SOURCES)) {
      expect(source).toContain(`/flags/4x3/${flag}.svg`);
    }
  });
});
