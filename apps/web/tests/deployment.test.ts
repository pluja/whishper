import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("production upload deployment", () => {
  it("accepts a complete 32 MiB tus chunk at the SvelteKit server boundary", async () => {
    const [compose, uploadSource] = await Promise.all([
      readFile(resolve(process.cwd(), "../../compose.yaml"), "utf8"),
      readFile(
        resolve(process.cwd(), "src/lib/library/upload.svelte.ts"),
        "utf8",
      ),
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

describe("toolchain versions", () => {
  const repositoryFile = (path: string) =>
    readFile(resolve(process.cwd(), "../..", path), "utf8");

  function dockerfileDefault(dockerfile: string, argument: string): string {
    const match = new RegExp(`^ARG ${argument}=(\\S+)$`, "m").exec(dockerfile);
    if (!match) throw new Error(`${argument} has no default in the Dockerfile`);
    return match[1];
  }

  it("builds the web image with the Node version CI uses", async () => {
    const [nodeVersion, dockerfile] = await Promise.all([
      repositoryFile(".node-version"),
      repositoryFile("apps/web/Dockerfile"),
    ]);

    expect(dockerfileDefault(dockerfile, "NODE_VERSION")).toBe(
      nodeVersion.trim(),
    );
  });

  it("builds the worker image with the Python and uv versions the workspace uses", async () => {
    const [pythonVersion, dockerfile, workflow] = await Promise.all([
      repositoryFile("workers/inference/.python-version"),
      repositoryFile("workers/inference/Dockerfile"),
      repositoryFile(".github/workflows/ci.yml"),
    ]);

    expect(dockerfileDefault(dockerfile, "PYTHON_VERSION")).toBe(
      pythonVersion.trim(),
    );
    expect(workflow).toContain(
      `version: ${dockerfileDefault(dockerfile, "UV_VERSION")}`,
    );
  });
});
