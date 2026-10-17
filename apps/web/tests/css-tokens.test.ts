import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const TAILWIND_THEME_NAMESPACE =
  /^--(?:color|font|text|font-weight|tracking|leading|breakpoint|container|spacing|radius|shadow|inset-shadow|drop-shadow|blur|perspective|aspect|ease|animate)(?:-|$)/;

function definedVariables(css: string): string[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const withoutThemeBlock = withoutComments.replace(/@theme\s*\{[^}]*\}/g, "");
  return [...withoutThemeBlock.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map(
    (match) => match[1],
  );
}

describe("css custom properties", () => {
  it.each(["src/tokens.css", "src/app.css"])(
    "%s defines nothing in a Tailwind theme namespace outside @theme",
    async (file) => {
      const css = await readFile(resolve(process.cwd(), file), "utf8");
      const variables = definedVariables(css);
      const shadowing = variables.filter((name) =>
        TAILWIND_THEME_NAMESPACE.test(name),
      );

      expect(variables.length).toBeGreaterThan(0);
      expect(shadowing).toEqual([]);
    },
  );
});
