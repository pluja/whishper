import { afterEach, describe, expect, it, vi } from "vitest";

import { readStorage, removeStorage, writeStorage } from "./safe-storage";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("safe storage", () => {
  it("reads and writes through to localStorage", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });

    expect(writeStorage("key", "value")).toBe(true);
    expect(readStorage("key")).toBe("value");
    removeStorage("key");
    expect(readStorage("key")).toBeNull();
  });

  it("degrades instead of throwing when the browser blocks storage", () => {
    const blocked = () => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    };
    vi.stubGlobal("localStorage", {
      getItem: blocked,
      setItem: blocked,
      removeItem: blocked,
    });

    expect(readStorage("key")).toBeNull();
    expect(writeStorage("key", "value")).toBe(false);
    expect(() => removeStorage("key")).not.toThrow();
  });
});
