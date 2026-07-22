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

  it("accepts the media preparation capability", () => {
    const manifest = parseWorkerManifest({
      protocolVersion: "1.0",
      workerId: "df5e0394-88e1-4ff1-8033-c0a670f0633e",
      name: "test-worker",
      version: "0.1.0",
      architecture: "x86_64",
      capabilities: { mediaPreparation: "1.0" },
      adapters: [],
    });

    expect(manifest.capabilities?.mediaPreparation).toBe("1.0");
  });

  it("keeps a validated hardware inventory", () => {
    const manifest = parseWorkerManifest({
      protocolVersion: "1.0",
      workerId: "df5e0394-88e1-4ff1-8033-c0a670f0633e",
      name: "test-worker",
      version: "0.1.0",
      architecture: "x86_64",
      capabilities: {},
      hardware: {
        device: "cuda",
        computeType: "float16",
        cpu: { model: "Test CPU", logicalCores: 8 },
        memory: { totalBytes: 16_000, availableBytes: 12_000 },
        gpus: [
          {
            name: "Test GPU",
            backend: "cuda",
            totalMemoryBytes: 8_000,
          },
        ],
      },
      adapters: [],
    });

    expect(manifest.hardware?.memory.availableBytes).toBe(12_000);
    expect(manifest.hardware?.gpus[0].backend).toBe("cuda");
  });

  it("rejects an invalid hardware inventory", () => {
    expect(() =>
      parseWorkerManifest({
        protocolVersion: "1.0",
        workerId: "df5e0394-88e1-4ff1-8033-c0a670f0633e",
        name: "test-worker",
        version: "0.1.0",
        architecture: "x86_64",
        capabilities: {},
        hardware: {
          device: "metal",
          computeType: "float16",
          cpu: { model: "Test CPU", logicalCores: 8 },
          memory: { totalBytes: 16_000, availableBytes: 12_000 },
          gpus: [],
        },
        adapters: [],
      }),
    ).toThrow("Worker hardware inventory is invalid");
  });

  it("rejects an unknown media preparation protocol", () => {
    expect(() =>
      parseWorkerManifest({
        protocolVersion: "1.0",
        workerId: "df5e0394-88e1-4ff1-8033-c0a670f0633e",
        name: "test-worker",
        version: "0.1.0",
        architecture: "x86_64",
        capabilities: { mediaPreparation: "2.0" },
        adapters: [],
      }),
    ).toThrow("Unsupported media preparation capability");
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
