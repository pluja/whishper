import {
  ADAPTER_PROTOCOL_VERSION,
  MEDIA_PREPARATION_VERSION,
  MODEL_CACHE_VERSION,
  WORKER_PROTOCOL_VERSION,
  type WorkerHardware,
} from "@anysub/contracts";
import { describe, expect, it } from "vitest";

import { parseWorkerManifest } from "./manifest";

const adapter = {
  protocolVersion: ADAPTER_PROTOCOL_VERSION,
  id: "test.adapter",
  displayName: "Test adapter",
  version: "1.0.0",
  description: null,
  models: [],
};

const hardware: WorkerHardware = {
  device: "cuda",
  cpu: { model: "Test CPU", logicalCores: 8 },
  memory: { totalBytes: 16_000, availableBytes: 12_000 },
  gpus: [{ name: "Test GPU", backend: "cuda", totalMemoryBytes: 8_000 }],
};

const manifest = {
  protocolVersion: WORKER_PROTOCOL_VERSION,
  workerId: "df5e0394-88e1-4ff1-8033-c0a670f0633e",
  name: "test-worker",
  version: "0.1.0",
  architecture: "x86_64",
  capabilities: {
    mediaPreparation: MEDIA_PREPARATION_VERSION,
    modelCache: MODEL_CACHE_VERSION,
    remoteTranscription: null,
  },
  adapters: [adapter],
  hardware,
  modelStorage: { totalBytes: 100_000, availableBytes: 40_000 },
};

describe("worker manifest validation", () => {
  it("accepts a manifest with adapters, capabilities and hardware", () => {
    const parsed = parseWorkerManifest(manifest);

    expect(parsed.adapters[0].id).toBe("test.adapter");
    expect(parsed.capabilities.mediaPreparation).toBe(
      MEDIA_PREPARATION_VERSION,
    );
    expect(parsed.hardware?.gpus[0].backend).toBe("cuda");
    expect(parsed.capabilities.modelCache).toBe(MODEL_CACHE_VERSION);
    expect(parsed.modelStorage?.availableBytes).toBe(40_000);
  });

  it("accepts a worker without media preparation or hardware details", () => {
    const parsed = parseWorkerManifest({
      ...manifest,
      capabilities: {
        mediaPreparation: null,
        modelCache: null,
        remoteTranscription: null,
      },
      hardware: null,
      modelStorage: null,
    });

    expect(parsed.capabilities.mediaPreparation).toBeNull();
    expect(parsed.hardware).toBeNull();
  });

  it("rejects a worker id that is not a UUID", () => {
    expect(() =>
      parseWorkerManifest({ ...manifest, workerId: "not-a-uuid" }),
    ).toThrow("/workerId");
  });

  it("rejects an unknown worker protocol", () => {
    expect(() =>
      parseWorkerManifest({ ...manifest, protocolVersion: "2.0" }),
    ).toThrow("/protocolVersion must be equal to constant");
  });

  it("rejects an unknown media preparation protocol", () => {
    expect(() =>
      parseWorkerManifest({
        ...manifest,
        capabilities: { mediaPreparation: "2.0" },
      }),
    ).toThrow("/capabilities/mediaPreparation");
  });

  it("rejects an unknown adapter protocol", () => {
    expect(() =>
      parseWorkerManifest({
        ...manifest,
        adapters: [{ ...adapter, protocolVersion: "2.0" }],
      }),
    ).toThrow("/adapters/0/protocolVersion must be equal to constant");
  });

  it("rejects an unsupported adapter capability", () => {
    expect(() =>
      parseWorkerManifest({
        ...manifest,
        adapters: [
          {
            ...adapter,
            models: [
              {
                id: "model",
                displayName: "Model",
                capabilities: ["translate"],
                languages: "all",
                description: null,
                parameterCount: null,
                requiredVramBytes: null,
                recommendedRamBytes: null,
                downloaded: null,
                optionsSchema: {},
              },
            ],
          },
        ],
      }),
    ).toThrow("/adapters/0/models/0/capabilities/0");
  });

  it("rejects an invalid hardware device", () => {
    expect(() =>
      parseWorkerManifest({
        ...manifest,
        hardware: { ...hardware, device: "metal" },
      }),
    ).toThrow("/hardware/device");
  });

  it("rejects more available than total memory", () => {
    expect(() =>
      parseWorkerManifest({
        ...manifest,
        hardware: {
          ...hardware,
          memory: { totalBytes: 16_000, availableBytes: 20_000 },
        },
      }),
    ).toThrow("Worker hardware inventory is invalid");
  });
});
