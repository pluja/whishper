import { describe, expect, it } from "vitest";

import { parseWorkerManifest } from "./queue";

describe("worker manifest validation", () => {
  it("accepts a v1 adapter manifest", () => {
    const manifest = parseWorkerManifest({
      protocolVersion: "1.0",
      workerId: "df5e0394-88e1-4ff1-8033-c0a670f0633e",
      name: "test-worker",
      version: "0.1.0",
      architecture: "x86_64",
      adapters: [
        {
          protocolVersion: "1.0",
          id: "test.adapter",
          displayName: "Test adapter",
          version: "1.0.0",
          models: [],
        },
      ],
    });

    expect(manifest.adapters[0].id).toBe("test.adapter");
  });

  it("rejects an unknown adapter protocol", () => {
    expect(() =>
      parseWorkerManifest({
        protocolVersion: "1.0",
        workerId: "df5e0394-88e1-4ff1-8033-c0a670f0633e",
        name: "test-worker",
        version: "0.1.0",
        architecture: "x86_64",
        adapters: [{ protocolVersion: "2.0", id: "test.adapter", models: [] }],
      }),
    ).toThrow("Unsupported adapter protocol");
  });
});
