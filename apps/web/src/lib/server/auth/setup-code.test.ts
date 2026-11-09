import { beforeEach, describe, expect, it, vi } from "vitest";

const { isInstanceInitialized } = vi.hoisted(() => ({
  isInstanceInitialized: vi.fn(),
}));
vi.mock("$lib/server/auth/instance", () => ({ isInstanceInitialized }));

import { announceSetupCode, isSetupCode } from "$lib/server/auth/setup-code";

function announcedCode(log: ReturnType<typeof vi.fn>): string {
  const match = /^ {4}(\S+)$/m.exec(String(log.mock.calls[0][0]));
  if (!match) throw new Error("No setup code in the log message");
  return match[1];
}

beforeEach(() => isInstanceInitialized.mockReset());

describe("setup code", () => {
  it("prints a code that the setup form then accepts", async () => {
    isInstanceInitialized.mockResolvedValue(false);
    const log = vi.fn();

    await announceSetupCode(log);

    const code = announcedCode(log);
    expect(isSetupCode(code)).toBe(true);
    expect(isSetupCode(code.toLowerCase())).toBe(true);
    expect(isSetupCode("AAAA-AAAA-AAAA")).toBe(false);
  });

  it("prints nothing once the owner exists", async () => {
    isInstanceInitialized.mockResolvedValue(true);
    const log = vi.fn();

    await announceSetupCode(log);

    expect(log).not.toHaveBeenCalled();
  });
});
