import { describe, expect, it } from "vitest";

import { normalizeFilename, originalStorageKey, projectNameFor } from "./media";

describe("media storage naming", () => {
  it("keeps display names while removing path components", () => {
    const filename = normalizeFilename("../archive/interview final.MKV");

    expect(filename).toBe("interview final.MKV");
    expect(projectNameFor(filename)).toBe("interview final");
  });

  it("uses an explicit normalized project title when one is provided", () => {
    expect(projectNameFor("source.mp4", "  Launch\n  cut  ")).toBe(
      "Launch cut",
    );
    expect(projectNameFor("fallback.mp4", "   ")).toBe("fallback");
  });

  it("uses IDs and a stable source name for canonical storage", () => {
    expect(
      originalStorageKey(
        "22b33a3a-31c8-4f33-b3d8-83a236c42dd1",
        "8dac7ff0-bac3-47c3-bd1a-e0fdff8d6ad2",
        "Film.MP4",
      ),
    ).toBe(
      "workspaces/22b33a3a-31c8-4f33-b3d8-83a236c42dd1/projects/8dac7ff0-bac3-47c3-bd1a-e0fdff8d6ad2/media/original/source.mp4",
    );
  });

  it("rejects empty and traversal-only names", () => {
    expect(() => normalizeFilename("../..")).toThrow("valid filename");
  });
});
