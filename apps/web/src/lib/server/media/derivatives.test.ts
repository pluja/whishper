import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/env", () => ({ privateEnv: { maxUploadBytes: 1024 } }));

import { derivativeMediaType, isMediaDerivativeKind } from "./derivatives";

describe("derivativeMediaType", () => {
  it.each([
    ["waveform", "application/vnd.anysub.waveform+json"],
    ["thumbnail", "image/jpeg"],
    ["proxy", "video/mp4"],
    ["proxy", "audio/mpeg"],
  ] as const)("serves an allowed %s type as stored", (kind, stored) => {
    expect(derivativeMediaType(kind, stored)).toBe(stored);
  });

  it.each([
    ["thumbnail", "text/html"],
    ["thumbnail", "video/mp4"],
    ["proxy", "image/svg+xml"],
  ] as const)(
    "serves a %s stored as %s as an opaque download",
    (kind, stored) => {
      expect(derivativeMediaType(kind, stored)).toBe(
        "application/octet-stream",
      );
    },
  );
});

describe("isMediaDerivativeKind", () => {
  it("accepts only the known kinds", () => {
    expect(isMediaDerivativeKind("proxy")).toBe(true);
    expect(isMediaDerivativeKind("original")).toBe(false);
  });
});
