import { describe, expect, it } from "vitest";

import { parseByteRange } from "$lib/server/media-stream";

describe("project media byte ranges", () => {
  it("parses bounded, open, and suffix ranges", () => {
    expect(parseByteRange("bytes=10-19", 100)).toEqual({ start: 10, end: 19 });
    expect(parseByteRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 });
    expect(parseByteRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
  });

  it("rejects invalid and out-of-bounds ranges", () => {
    expect(parseByteRange("bytes=100-", 100)).toBeNull();
    expect(parseByteRange("bytes=30-20", 100)).toBeNull();
    expect(parseByteRange("items=0-1", 100)).toBeNull();
  });
});
