import { describe, expect, it } from "vitest";

import {
  availableTranscriptionModels,
  detectedWorkerHardware,
} from "$lib/server/adapters";

describe("available transcription models", () => {
  it("combines active worker manifests, hides diagnostics, and deduplicates models", () => {
    const whisperx = {
      id: "whisperx",
      displayName: "WhisperX",
      version: "1",
      protocolVersion: "1.0",
      models: [
        {
          id: "small",
          displayName: "Small",
          capabilities: ["transcribe", "align"],
          languages: "all",
          downloaded: true,
          optionsSchema: { type: "object" },
        },
      ],
    };
    const models = availableTranscriptionModels([
      { adapters: [whisperx, { ...whisperx, id: "builtin.fake" }] },
      {
        adapters: [
          {
            ...whisperx,
            models: whisperx.models.map((model) => ({
              ...model,
              downloaded: false,
            })),
          },
        ],
      },
      { adapters: "invalid" },
    ]);

    expect(models).toEqual([
      expect.objectContaining({
        key: "whisperx:small",
        adapterId: "whisperx",
        modelId: "small",
        downloaded: true,
        recommended: false,
      }),
    ]);
  });

  it("scores each model against the best active worker hardware", () => {
    const gib = 1024 ** 3;
    const models = availableTranscriptionModels([
      {
        name: "local-cpu",
        hardware: {
          device: "cpu",
          computeType: "int8",
          cpu: { model: "Test CPU", logicalCores: 8 },
          memory: { totalBytes: 8 * gib, availableBytes: 6 * gib },
          gpus: [],
        },
        adapters: [
          {
            id: "whisperx",
            displayName: "WhisperX",
            version: "1",
            protocolVersion: "1.0",
            models: [
              {
                id: "small",
                displayName: "Small",
                capabilities: ["transcribe", "align"],
                languages: "all",
                parameterCount: 244_000_000,
                requiredVramBytes: 2 * gib,
                recommendedRamBytes: 4 * gib,
                downloaded: false,
              },
              {
                id: "medium",
                displayName: "Medium",
                capabilities: ["transcribe", "align"],
                languages: "all",
                parameterCount: 769_000_000,
                requiredVramBytes: 5 * gib,
                recommendedRamBytes: 8 * gib,
                downloaded: false,
              },
            ],
          },
        ],
      },
    ]);

    expect(models).toEqual([
      expect.objectContaining({
        modelId: "small",
        parameterCount: 244_000_000,
        fit: "good",
        fitLabel: "Runs well",
        workerSummary: expect.stringContaining("6.00 GiB RAM available"),
        downloaded: false,
        memoryRequirementBytes: 4 * gib,
        memoryRequirementKind: "ram",
      }),
      expect.objectContaining({
        modelId: "medium",
        fit: "poor",
        fitLabel: "Not recommended",
        fitReason: expect.stringContaining("8.00 GiB"),
        memoryRequirementBytes: 8 * gib,
        memoryRequirementKind: "ram",
      }),
    ]);
  });

  it("warns when a large model fits RAM but is likely slow on CPU", () => {
    const gib = 1024 ** 3;
    const [model] = availableTranscriptionModels([
      {
        name: "cpu-worker",
        hardware: {
          device: "cpu",
          computeType: "int8",
          cpu: { logicalCores: 16 },
          memory: { totalBytes: 16 * gib, availableBytes: 12 * gib },
          gpus: [],
        },
        adapters: [
          {
            id: "whisperx",
            displayName: "WhisperX",
            models: [
              {
                id: "medium",
                displayName: "Medium",
                capabilities: ["transcribe"],
                languages: "all",
                recommendedRamBytes: 8 * gib,
              },
            ],
          },
        ],
      },
    ]);

    expect(model).toEqual(
      expect.objectContaining({
        fit: "caution",
        fitLabel: "May be slow",
        fitReason: expect.stringContaining("supported graphics card"),
        memoryRequirementBytes: 8 * gib,
        memoryRequirementKind: "ram",
      }),
    );
  });

  it("recommends Large v3 Turbo when it fits a CUDA worker", () => {
    const gib = 1024 ** 3;
    const [model] = availableTranscriptionModels([
      {
        name: "cuda-worker",
        hardware: {
          device: "cuda",
          computeType: "float16",
          cpu: { logicalCores: 16 },
          memory: { totalBytes: 32 * gib, availableBytes: 24 * gib },
          gpus: [
            {
              name: "Test GPU",
              backend: "cuda",
              totalMemoryBytes: 4 * gib,
            },
          ],
        },
        adapters: [
          {
            id: "whisperx",
            displayName: "WhisperX",
            models: [
              {
                id: "large-v3-turbo",
                displayName: "Large v3 Turbo",
                capabilities: ["transcribe"],
                languages: "all",
                requiredVramBytes: 3 * gib,
                recommendedRamBytes: 12 * gib,
              },
            ],
          },
        ],
      },
    ]);

    expect(model).toEqual(
      expect.objectContaining({
        modelId: "large-v3-turbo",
        requiredVramBytes: 3 * gib,
        fit: "good",
        fitLabel: "Runs well",
        recommended: true,
        memoryRequirementBytes: 3 * gib,
        memoryRequirementKind: "vram",
      }),
    );
  });

  it("reports structured detected hardware without duplicates", () => {
    const gib = 1024 ** 3;
    const worker = {
      name: "local-cpu",
      hardware: {
        device: "cpu",
        computeType: "int8",
        cpu: { model: "Test CPU", logicalCores: 8 },
        memory: { totalBytes: 16 * gib, availableBytes: 12 * gib },
        gpus: [],
      },
    };

    expect(
      detectedWorkerHardware([worker, worker, { name: "legacy" }]),
    ).toEqual([
      {
        kind: "cpu",
        name: "Test CPU",
        details: ["8 logical cores", "12.0 GiB RAM available"],
      },
    ]);
  });
});
