import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { findInsecureSettings } from "../src/lib/server/env";

const REPOSITORY_ROOT = resolve(process.cwd(), "../..");
const PLACEHOLDER_PREFIX = "change-this-";

function parseEnvFile(content: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

function secretsFrom(values: Record<string, string>) {
  return {
    authSecret: values.BETTER_AUTH_SECRET,
    workerToken: values.ANYSUB_WORKER_TOKEN,
    databaseUrl: `postgresql://${values.POSTGRES_USER}:${values.POSTGRES_PASSWORD}@postgres:5432/${values.POSTGRES_DB}`,
  };
}

describe(".env.example", () => {
  it("holds placeholders that the server refuses to start with", async () => {
    const template = parseEnvFile(
      await readFile(join(REPOSITORY_ROOT, ".env.example"), "utf8"),
    );
    const placeholderNames = Object.keys(template).filter((name) =>
      template[name].startsWith(PLACEHOLDER_PREFIX),
    );

    expect(placeholderNames.toSorted()).toEqual([
      "ANYSUB_WORKER_TOKEN",
      "BETTER_AUTH_SECRET",
      "POSTGRES_PASSWORD",
    ]);

    const problems = findInsecureSettings(secretsFrom(template));
    expect(problems).toHaveLength(placeholderNames.length);
    for (const problem of problems) {
      expect(problem).toMatch(/placeholder/);
    }
  });
});

describe("scripts/init-env.sh", () => {
  const sandboxes: string[] = [];

  afterEach(async () => {
    await Promise.all(
      sandboxes.splice(0).map((path) => rm(path, { recursive: true })),
    );
  });

  async function createSandbox(): Promise<string> {
    const sandbox = await mkdtemp(join(tmpdir(), "anysub-init-env-"));
    sandboxes.push(sandbox);
    await mkdir(join(sandbox, "scripts"));
    await copyFile(
      join(REPOSITORY_ROOT, ".env.example"),
      join(sandbox, ".env.example"),
    );
    await copyFile(
      join(REPOSITORY_ROOT, "scripts/init-env.sh"),
      join(sandbox, "scripts/init-env.sh"),
    );
    return sandbox;
  }

  function runInitEnv(sandbox: string) {
    return spawnSync("sh", [join(sandbox, "scripts/init-env.sh")], {
      encoding: "utf8",
    });
  }

  it("replaces every placeholder with a unique, private secret", async () => {
    const sandbox = await createSandbox();

    expect(runInitEnv(sandbox).status).toBe(0);

    const envFile = join(sandbox, ".env");
    const generated = parseEnvFile(await readFile(envFile, "utf8"));
    const template = parseEnvFile(
      await readFile(join(sandbox, ".env.example"), "utf8"),
    );

    expect(findInsecureSettings(secretsFrom(generated))).toEqual([]);
    const secrets = [
      generated.POSTGRES_PASSWORD,
      generated.BETTER_AUTH_SECRET,
      generated.ANYSUB_WORKER_TOKEN,
    ];
    expect(new Set(secrets).size).toBe(secrets.length);
    for (const secret of secrets) expect(secret).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(generated.BETTER_AUTH_URL).toBe(template.BETTER_AUTH_URL);
    expect((await stat(envFile)).mode & 0o777).toBe(0o600);
  });

  it("refuses to overwrite an existing .env", async () => {
    const sandbox = await createSandbox();
    expect(runInitEnv(sandbox).status).toBe(0);
    const before = await readFile(join(sandbox, ".env"), "utf8");

    const second = runInitEnv(sandbox);

    expect(second.status).not.toBe(0);
    expect(second.stderr).toContain("already exists");
    expect(await readFile(join(sandbox, ".env"), "utf8")).toBe(before);
  });
});
