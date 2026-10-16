import { describe, expect, it } from "vitest";

import { formatBytes, formatClock, formatDuration } from "./format";

describe("formatBytes", () => {
  it("scales through binary units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.50 KiB");
    expect(formatBytes(15 * 1024 * 1024)).toBe("15.0 MiB");
  });
});

describe("clock formatting", () => {
  it("omits hours below one hour", () => {
    expect(formatClock(75)).toBe("1:15");
  });

  it("includes padded minutes once hours appear", () => {
    expect(formatClock(3_725)).toBe("1:02:05");
  });

  it("rounds microsecond durations to the nearest second", () => {
    expect(formatDuration(59_600_000)).toBe("1:00");
  });
});
