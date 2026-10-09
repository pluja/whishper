import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("production upload deployment", () => {
  it("accepts a complete 32 MiB tus chunk at the SvelteKit server boundary", async () => {
    const [compose, uploadSource] = await Promise.all([
      readFile(resolve(process.cwd(), "../../compose.yaml"), "utf8"),
      readFile(resolve(process.cwd(), "src/lib/upload.svelte.ts"), "utf8"),
    ]);
    const bodyLimit = /ANYSUB_BODY_SIZE_LIMIT:-(\d+)M/.exec(compose);
    const chunkSize = /chunkSize:\s*(\d+)\s*\*\s*1024\s*\*\s*1024/.exec(
      uploadSource,
    );

    expect(bodyLimit?.[1]).toBeDefined();
    expect(chunkSize?.[1]).toBeDefined();
    expect(Number(bodyLimit?.[1])).toBeGreaterThan(Number(chunkSize?.[1]));
  });
});
