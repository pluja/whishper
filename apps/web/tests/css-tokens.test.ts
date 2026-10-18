import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const TAILWIND_THEME_NAMESPACE =
  /^--(?:color|font|text|font-weight|tracking|leading|breakpoint|container|spacing|radius|shadow|inset-shadow|drop-shadow|blur|perspective|aspect|ease|animate)(?:-|$)/;

function withoutThemeBlocks(css: string): string {
  let result = "";
  let index = 0;
  for (const match of css.matchAll(/@theme\s*\{/g)) {
    if (match.index < index) continue;
    result += css.slice(index, match.index);
    let depth = 0;
    let cursor = match.index + match[0].length - 1;
    do {
      if (css[cursor] === "{") depth += 1;
      if (css[cursor] === "}") depth -= 1;
      cursor += 1;
    } while (depth > 0 && cursor < css.length);
    index = cursor;
  }
  return result + css.slice(index);
}

function definedVariables(css: string): string[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [
    ...withoutThemeBlocks(withoutComments).matchAll(/^\s*(--[\w-]+)\s*:/gm),
  ].map((match) => match[1]);
}

describe("css custom properties", () => {
  it("app.css defines nothing in a Tailwind theme namespace outside @theme", async () => {
    const css = await readFile(resolve(process.cwd(), "src/app.css"), "utf8");
    const variables = definedVariables(css);
    const shadowing = variables.filter((name) =>
      TAILWIND_THEME_NAMESPACE.test(name),
    );

    expect(variables.length).toBeGreaterThan(0);
    expect(shadowing).toEqual([]);
  });

  it("ignores variables nested deeper inside @theme", () => {
    const css = `@theme {\n  --color-a: red;\n  @keyframes x { to { opacity: 0; } }\n  --color-b: blue;\n}\n:root {\n  --theme-a: red;\n}`;
    expect(definedVariables(css)).toEqual(["--theme-a"]);
  });
});
