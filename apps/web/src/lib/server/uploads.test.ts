import { describe, expect, it } from "vitest";

import { declaredUploadMediaType } from "./uploads";

describe("declared upload media type", () => {
  it("accepts audio, video and the browser application aliases", () => {
    expect(declaredUploadMediaType("video/mp4")).toBe("video/mp4");
    expect(declaredUploadMediaType("application/ogg")).toBe("application/ogg");
  });

  it("treats a missing or empty type as unknown", () => {
    expect(declaredUploadMediaType(undefined)).toBeNull();
    expect(declaredUploadMediaType("  ")).toBeNull();
  });

  it("rejects other types with a 400", () => {
    expect(() => declaredUploadMediaType("text/html")).toThrow(
      expect.objectContaining({ status_code: 400 }),
    );
  });
});
