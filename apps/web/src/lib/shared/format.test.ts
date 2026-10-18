import { describe, expect, it } from "vitest";

import {
  formatBytes,
  formatClock,
  formatDuration,
  formatRelativeTime,
  pluralize,
} from "./format";

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

describe("pluralize", () => {
  it("keeps the singular noun only for exactly one", () => {
    expect(pluralize(1, "cue")).toBe("1 cue");
    expect(pluralize(0, "cue")).toBe("0 cues");
    expect(pluralize(2, "cue")).toBe("2 cues");
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  const ago = (seconds: number) => new Date(now.getTime() - seconds * 1_000);

  it("rounds down to the largest whole unit", () => {
    expect(formatRelativeTime(ago(30), now)).toBe("just now");
    expect(formatRelativeTime(ago(5 * 60 + 59), now)).toBe("5 minutes ago");
    expect(formatRelativeTime(ago(90 * 60), now)).toBe("1 hour ago");
    expect(formatRelativeTime(ago(26 * 3_600), now)).toBe("yesterday");
    expect(formatRelativeTime(ago(21 * 86_400), now)).toBe("3 weeks ago");
    expect(formatRelativeTime(ago(400 * 86_400), now)).toBe("last year");
  });

  it("treats a timestamp ahead of the clock as just now", () => {
    expect(formatRelativeTime(ago(-5 * 60), now)).toBe("just now");
  });
});
