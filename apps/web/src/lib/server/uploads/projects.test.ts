import { describe, expect, it } from "vitest";

import { normalizeFilename, projectNameFor } from "./projects";

describe("upload project naming", () => {
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

  it("rejects empty and traversal-only names", () => {
    expect(() => normalizeFilename("../..")).toThrow(
      expect.objectContaining({
        statusCode: 400,
        message: "A valid filename is required.",
      }),
    );
  });
});
