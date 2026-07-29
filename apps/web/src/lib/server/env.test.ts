import { describe, expect, it } from "vitest";

import {
  findInsecureSettings,
  insecureSettingsReport,
  type RuntimeSecrets,
} from "./env";

const SECURE: RuntimeSecrets = {
  authSecret: "5RY5aXBpdmZ0aGVyZWFsc2VjcmV0dmFsdWVoZXJl",
  workerToken: "d29ya2VydG9rZW53aXRoZW5vdWdo",
  databaseUrl: "postgresql://anysub:Wm9uZVNlY3JldA@postgres:5432/anysub",
};

describe("insecure credential detection", () => {
  it("accepts unique, long credentials", () => {
    expect(findInsecureSettings(SECURE)).toEqual([]);
  });

  it("rejects the placeholders published in .env.example", () => {
    const problems = findInsecureSettings({
      authSecret: "change-this-to-at-least-32-random-characters",
      workerToken: "change-this-worker-token",
      databaseUrl:
        "postgresql://anysub:change-this-database-password@postgres:5432/anysub",
    });

    expect(problems).toHaveLength(3);
    expect(problems[0]).toContain("BETTER_AUTH_SECRET");
    expect(problems[1]).toContain("ANYSUB_WORKER_TOKEN");
    expect(problems[2]).toContain("DATABASE_URL");
  });

  it("rejects the former Compose defaults", () => {
    const problems = findInsecureSettings({
      authSecret: "local-development-secret-change-before-exposing",
      workerToken: "local-worker-token-change-before-exposing",
      databaseUrl: "postgresql://anysub:anysub-local-only@postgres:5432/anysub",
    });

    expect(problems).toHaveLength(3);
  });

  it("rejects the build-time placeholder secret", () => {
    const problems = findInsecureSettings({
      ...SECURE,
      authSecret: "build-only-placeholder-secret-at-least-32-chars",
    });

    expect(problems).toEqual([
      expect.stringContaining("BETTER_AUTH_SECRET is still a placeholder"),
    ]);
  });

  it("reports unset credentials", () => {
    const problems = findInsecureSettings({
      ...SECURE,
      authSecret: "",
      workerToken: "",
    });

    expect(problems).toEqual([
      "BETTER_AUTH_SECRET is not set. It signs session cookies.",
      "ANYSUB_WORKER_TOKEN is not set. It authenticates workers against the job API.",
    ]);
  });

  it("requires enough entropy to be worth signing with", () => {
    const problems = findInsecureSettings({
      ...SECURE,
      authSecret: "short-but-unique",
      workerToken: "also-short",
    });

    expect(problems).toEqual([
      "BETTER_AUTH_SECRET is shorter than 32 characters. It signs session cookies.",
      "ANYSUB_WORKER_TOKEN is shorter than 24 characters. It authenticates workers against the job API.",
    ]);
  });

  it("decodes percent-encoded database passwords before comparing", () => {
    const problems = findInsecureSettings({
      ...SECURE,
      databaseUrl:
        "postgresql://anysub:anysub%2Dlocal%2Donly@postgres:5432/anysub",
    });

    expect(problems).toEqual([expect.stringContaining("DATABASE_URL")]);
  });

  it("ignores a database URL it cannot parse", () => {
    expect(
      findInsecureSettings({ ...SECURE, databaseUrl: "not-a-url" }),
    ).toEqual([]);
  });

  it("never repeats a credential value in the report", () => {
    const report = insecureSettingsReport(
      findInsecureSettings({
        authSecret: "change-this-to-at-least-32-random-characters",
        workerToken: "change-this-worker-token",
        databaseUrl: SECURE.databaseUrl,
      }),
    );

    expect(report).not.toContain("change-this-to-at-least-32");
    expect(report).not.toContain("change-this-worker-token");
    expect(report).toContain("scripts/init-env.sh");
  });
});
