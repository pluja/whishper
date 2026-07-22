import { describe, expect, it } from "vitest";

import {
  availableTranscriptionModels,
  detectedWorkerHardwareSummaries,
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
        workerSummary: expect.stringContaining("6 GB RAM available"),
        downloaded: false,
      }),
      expect.objectContaining({
        modelId: "medium",
        fit: "poor",
        fitLabel: "Not recommended",
        fitReason: expect.stringContaining("8 GB"),
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
      }),
    );
  });

  it("reports detected worker hardware without duplicate summaries", () => {
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
      detectedWorkerHardwareSummaries([worker, worker, { name: "legacy" }]),
    ).toEqual(["Test CPU · 8 cores · 12 GB RAM available"]);
  });
});
