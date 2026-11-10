import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearRecoveryCode,
  isRecoveryCode,
  issueRecoveryCode,
} from "$lib/server/auth/recovery-code";

function issuedCode(log: ReturnType<typeof vi.fn>, call = 0): string {
  const match = /^ {4}(\S+)$/m.exec(String(log.mock.calls[call][0]));
  if (!match) throw new Error("No recovery code in the log message");
  return match[1];
}

afterEach(() => clearRecoveryCode());

describe("recovery code", () => {
  it("accepts the logged code for fifteen minutes", () => {
    const log = vi.fn();
    issueRecoveryCode(log, 0);
    const code = issuedCode(log);

    expect(isRecoveryCode(code, 15 * 60_000)).toBe(true);
    expect(isRecoveryCode(code, 15 * 60_000 + 1)).toBe(false);
    expect(isRecoveryCode("AAAA-BBBB-CCCC", 0)).toBe(false);
  });

  it("accepts nothing before a code is requested or after it is used", () => {
    expect(isRecoveryCode("AAAA-BBBB-CCCC", 0)).toBe(false);
    const log = vi.fn();
    issueRecoveryCode(log, 0);
    const code = issuedCode(log);
    clearRecoveryCode();
    expect(isRecoveryCode(code, 0)).toBe(false);
  });

  it("prints nothing when asked again within thirty seconds", () => {
    const log = vi.fn();
    issueRecoveryCode(log, 0);
    issueRecoveryCode(log, 29_000);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("prints the same code again until it expires", () => {
    const log = vi.fn();
    issueRecoveryCode(log, 0);
    issueRecoveryCode(log, 10 * 60_000 + 30_000);

    expect(log).toHaveBeenCalledTimes(2);
    expect(issuedCode(log, 1)).toBe(issuedCode(log, 0));
    expect(String(log.mock.calls[1][0])).toContain("within 5 minutes");
    expect(isRecoveryCode(issuedCode(log, 0), 15 * 60_000)).toBe(true);
  });

  it("prints a new code once the old one expired or was used", () => {
    const log = vi.fn();
    issueRecoveryCode(log, 0);
    issueRecoveryCode(log, 15 * 60_000 + 1);
    expect(issuedCode(log, 1)).not.toBe(issuedCode(log, 0));
    expect(isRecoveryCode(issuedCode(log, 0), 15 * 60_000 + 1)).toBe(false);

    clearRecoveryCode();
    issueRecoveryCode(log, 15 * 60_000 + 2);
    expect(issuedCode(log, 2)).not.toBe(issuedCode(log, 1));
    expect(String(log.mock.calls[2][0])).toContain("within 15 minutes");
  });
});
