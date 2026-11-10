import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repositoryFile = (path: string) =>
  readFile(resolve(process.cwd(), "../..", path), "utf8");

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
  // Dependabot does not substitute build args, so the Dockerfiles carry the
  // tags literally and this test keeps them aligned with the other files.
  function fromTags(dockerfile: string, image: string): string[] {
    const tags = [...dockerfile.matchAll(/^FROM (\S+):(\d[\d.]*)/gm)]
      .filter(([, name]) => name.split("/").pop() === image)
      .map(([, , tag]) => tag);
    expect(tags.length, `${image} FROM lines`).toBeGreaterThan(0);
    return tags;
  }

  function workflowStep(workflow: string, action: string): string {
    const step = workflow
      .split(/^ {6}- /m)
      .find((candidate) => candidate.startsWith(`uses: ${action}@`));
    if (!step) throw new Error(`${action} step not found in ci.yml`);
    return step;
  }

  it("builds the web image with the Node version CI uses", async () => {
    const [nodeVersion, dockerfile] = await Promise.all([
      repositoryFile(".node-version"),
      repositoryFile("apps/web/Dockerfile"),
    ]);

    for (const tag of fromTags(dockerfile, "node")) {
      expect(tag).toBe(nodeVersion.trim());
    }
  });

  it("requires at least the Node version the repository pins", async () => {
    const [nodeVersion, packageJson] = await Promise.all([
      repositoryFile(".node-version"),
      repositoryFile("package.json"),
    ]);
    const [major, minor] = nodeVersion.trim().split(".");

    expect(JSON.parse(packageJson).engines.node).toBe(`>=${major}.${minor}.0`);
  });

  it("builds the worker image with the Python version uv uses", async () => {
    const [pythonVersion, dockerfile] = await Promise.all([
      repositoryFile("workers/inference/.python-version"),
      repositoryFile("workers/inference/Dockerfile"),
    ]);

    for (const tag of fromTags(dockerfile, "python")) {
      expect(tag).toBe(pythonVersion.trim());
    }
  });

  it("copies the uv binary from the version CI installs", async () => {
    const [dockerfile, workflow] = await Promise.all([
      repositoryFile("workers/inference/Dockerfile"),
      repositoryFile(".github/workflows/ci.yml"),
    ]);
    const setupUvVersion = /^\s+version:\s*(\S+)/m.exec(
      workflowStep(workflow, "astral-sh/setup-uv"),
    )?.[1];

    expect(fromTags(dockerfile, "uv")).toEqual([setupUvVersion]);
  });

  it("runs ui-check in the Playwright image that matches the pinned package", async () => {
    const [compose, packageJson] = await Promise.all([
      repositoryFile("compose.dev.yaml"),
      repositoryFile("apps/web/package.json"),
    ]);
    const pinned = JSON.parse(packageJson).devDependencies.playwright;
    const imageTag = /image:\s*mcr\.microsoft\.com\/playwright:v([\d.]+)-/.exec(
      compose,
    )?.[1];

    expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
    expect(imageTag).toBe(pinned);
  });
});

describe("release version", () => {
  it("gives the application, the worker and every published image one version", async () => {
    const [webPackage, workerProject, compose, cudaCompose, changelog] =
      await Promise.all([
        repositoryFile("apps/web/package.json"),
        repositoryFile("workers/inference/pyproject.toml"),
        repositoryFile("compose.yaml"),
        repositoryFile("compose.cuda.yaml"),
        repositoryFile("CHANGELOG.md"),
      ]);
    const version = JSON.parse(webPackage).version;
    const images = (file: string) =>
      [...file.matchAll(/^\s+image:\s*(\S+)/gm)].map(([, image]) => image);

    expect(version).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/);
    expect(/^version = "(.+)"$/m.exec(workerProject)?.[1]).toBe(version);
    expect(images(compose)).toEqual([
      `ghcr.io/pluja/anysub:${version}`,
      `ghcr.io/pluja/anysub-worker:${version}`,
    ]);
    expect(images(cudaCompose)).toEqual([
      `ghcr.io/pluja/anysub-worker:${version}-cuda`,
    ]);
    expect(changelog).toContain(`\n## [${version}] - `);
  });
});
