import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LANGUAGE_TAG, LANGUAGES, matchesLanguage } from "./languages";

const COMMON_CODES = [
  "en",
  "es",
  "fr",
  "de",
  "it",
  "pt",
  "nl",
  "pl",
  "uk",
  "el",
  "ar",
  "hi",
  "ja",
  "ko",
  "zh",
];

function language(code: string) {
  const found = LANGUAGES.find((candidate) => candidate.code === code);
  if (!found) throw new Error(`missing language ${code}`);
  return found;
}

describe("LANGUAGES", () => {
  it("has unique codes that the server accepts", () => {
    const codes = LANGUAGES.map(({ code }) => code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(LANGUAGE_TAG);
  });

  it("lists the common languages first, in their familiar order", () => {
    const common = LANGUAGES.filter((entry) => entry.common);
    expect(common.map(({ code }) => code)).toEqual(COMMON_CODES);
    expect(LANGUAGES.slice(0, common.length)).toEqual(common);
  });

  it("lists the other languages A to Z by English name", () => {
    const names = LANGUAGES.filter((entry) => !entry.common).map(
      ({ name }) => name,
    );
    expect(names).toEqual(names.toSorted((a, b) => a.localeCompare(b, "en")));
  });

  it("covers every Whisper language, Cantonese included", () => {
    expect(LANGUAGES).toHaveLength(100);
    expect(language("yue").name).toBe("Cantonese");
    expect(language("jw").name).toBe("Javanese");
  });

  it("names every language in English and natively", () => {
    for (const entry of LANGUAGES) {
      expect(entry.name.trim()).not.toBe("");
      expect(entry.nativeName.trim()).not.toBe("");
    }
  });

  it("points every flag at a file in flag-icons", () => {
    const require = createRequire(import.meta.url);
    for (const { flag } of LANGUAGES) {
      if (flag === null) continue;
      const path = require.resolve(`flag-icons/flags/4x3/${flag}.svg`);
      expect(existsSync(path)).toBe(true);
    }
  });

  it("flags ambiguous languages with their country of origin", () => {
    expect(language("en").flag).toBe("gb");
    expect(language("es").flag).toBe("es");
    expect(language("pt").flag).toBe("pt");
    expect(language("ar").flag).toBe("sa");
    expect(language("zh").flag).toBe("cn");
    expect(language("la").flag).toBeNull();
    expect(language("sa").flag).toBeNull();
  });
});

describe("LANGUAGE_TAG", () => {
  it("accepts language tags and rejects anything else", () => {
    expect(LANGUAGE_TAG.test("haw")).toBe(true);
    expect(LANGUAGE_TAG.test("pt-BR")).toBe(true);
    expect(LANGUAGE_TAG.test("auto")).toBe(false);
    expect(LANGUAGE_TAG.test("EN")).toBe(false);
    expect(LANGUAGE_TAG.test("e")).toBe(false);
  });
});

describe("matchesLanguage", () => {
  it("matches English names regardless of case", () => {
    expect(matchesLanguage(language("es"), "SPAN")).toBe(true);
    expect(matchesLanguage(language("es"), "german")).toBe(false);
  });

  it("matches native names without typing accents", () => {
    expect(matchesLanguage(language("es"), "espanol")).toBe(true);
    expect(matchesLanguage(language("fr"), "francais")).toBe(true);
    expect(matchesLanguage(language("ja"), "日本")).toBe(true);
    expect(matchesLanguage(language("el"), "ελληνικα")).toBe(true);
  });

  it("matches language codes", () => {
    expect(matchesLanguage(language("yue"), "yue")).toBe(true);
    expect(matchesLanguage(language("jw"), "jw")).toBe(true);
  });
});
