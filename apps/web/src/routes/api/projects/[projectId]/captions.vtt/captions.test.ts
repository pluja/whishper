import { describe, expect, it } from "vitest";

import { _vttTime } from "./+server";

describe("WebVTT time formatting", () => {
  it("formats integer microseconds without floating point drift", () => {
    expect(_vttTime(3_723_456_789)).toBe("01:02:03.456");
    expect(_vttTime(-1)).toBe("00:00:00.000");
  });
});
