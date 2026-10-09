import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  GENERATED_DIRECTORY,
  generateProtocolSources,
} from "../scripts/generate.mjs";

describe("generated protocol sources", () => {
  it("match a fresh generation from the committed schema", async () => {
    for (const [fileName, expected] of Object.entries(
      await generateProtocolSources(),
    )) {
      const committed = await readFile(
        join(GENERATED_DIRECTORY, fileName),
        "utf8",
      );
      expect(
        committed,
        `src/generated/${fileName} is stale. Run \`pnpm --filter @anysub/contracts generate\`.`,
      ).toBe(expected);
    }
  });
});
