import { describe, expect, it } from "vitest";

import { mediaPlaceholder } from "./media-placeholder";

describe("mediaPlaceholder", () => {
  it("picks an icon per media type", () => {
    const icon = (mediaType: string | null, originalFilename: string | null) =>
      mediaPlaceholder({ mediaType, originalFilename }).icon;
    expect(icon("audio/wav", null)).toBe("audio");
    expect(icon(null, "talk.mp3")).toBe("audio");
    expect(icon("video/mp4", null)).toBe("play");
    expect(icon(null, null)).toBe("file");
  });
});
