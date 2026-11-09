import { describe, expect, it } from "vitest";

import { findInsecureSettings } from "./env";

const NONE = { authSecretOverride: null, workerTokenOverride: null };

describe("secret overrides", () => {
  it("accepts generated secrets, which need no variables", () => {
    expect(findInsecureSettings(NONE)).toEqual([]);
  });

  it("accepts long, unique overrides", () => {
    expect(
      findInsecureSettings({
        authSecretOverride: "5RY5aXBpdmZ0aGVyZWFsc2VjcmV0dmFsdWVoZXJl",
        workerTokenOverride: "d29ya2VydG9rZW53aXRoZW5vdWdo",
      }),
    ).toEqual([]);
  });

  it("rejects placeholders published in the repository history", () => {
    const problems = findInsecureSettings({
      authSecretOverride: "change-this-to-at-least-32-random-characters",
      workerTokenOverride: "local-worker-token-change-before-exposing",
    });

    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("BETTER_AUTH_SECRET");
    expect(problems[1]).toContain("ANYSUB_WORKER_TOKEN");
  });

  it("rejects short overrides without echoing them", () => {
    const problems = findInsecureSettings({
      ...NONE,
      workerTokenOverride: "too-short-secret",
    });

    expect(problems).toEqual([
      "ANYSUB_WORKER_TOKEN is shorter than 24 characters. It authenticates workers against the job API.",
    ]);
    expect(problems.join(" ")).not.toContain("too-short-secret");
  });
});
