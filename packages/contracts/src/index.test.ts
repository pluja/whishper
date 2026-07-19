import { describe, expect, it } from "vitest";

import { ADAPTER_PROTOCOL_VERSION, WORKER_PROTOCOL_VERSION } from "./index";

describe("protocol versions", () => {
  it("use explicit major and minor versions", () => {
    expect(ADAPTER_PROTOCOL_VERSION).toMatch(/^\d+\.\d+$/);
    expect(WORKER_PROTOCOL_VERSION).toMatch(/^\d+\.\d+$/);
  });
});
