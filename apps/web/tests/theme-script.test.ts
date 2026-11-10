import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { SYSTEM_DARK_QUERY } from "$lib/browser/theme.svelte";
import {
  parseThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
} from "$lib/shared/theme";

async function inlineThemeScript(): Promise<string> {
  const html = await readFile(resolve(process.cwd(), "src/app.html"), "utf8");
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (!script) throw new Error("app.html has no inline script");
  return script;
}

function themeChosenBy(
  script: string,
  stored: string | null,
  systemPrefersDark: boolean,
): string | undefined {
  const root = { dataset: {} as Record<string, string> };
  const localStorage = {
    getItem: (key: string) => (key === THEME_STORAGE_KEY ? stored : null),
  };
  const matchMedia = (query: string) => ({
    matches: query === SYSTEM_DARK_QUERY && systemPrefersDark,
  });
  new Function("localStorage", "matchMedia", "document", script)(
    localStorage,
    matchMedia,
    { documentElement: root },
  );
  return root.dataset.theme;
}

describe("app.html theme script", () => {
  it.each([
    ["light", false],
    ["light", true],
    ["dark", false],
    ["dark", true],
    ["system", false],
    ["system", true],
    [null, true],
    ["sepia", true],
  ])(
    "resolves a stored %s with a dark system %s as the theme module does",
    async (stored, systemPrefersDark) => {
      const script = await inlineThemeScript();

      expect(themeChosenBy(script, stored, systemPrefersDark)).toBe(
        resolveTheme(parseThemePreference(stored), systemPrefersDark),
      );
    },
  );
});
