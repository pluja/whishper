import type {
  AdapterModel,
  WorkerHardware,
  WorkerManifest,
} from "@anysub/contracts";
import { describe, expect, it } from "vitest";

import {
  availableTranscriptionModels,
  detectedWorkerHardware,
} from "#lib/server/transcription/models.ts";

const GIB = 1024 ** 3;

function model(
  id: string,
  overrides: Partial<AdapterModel> = {},
): AdapterModel {
  return {
    id,
    displayName: id,
    capabilities: ["transcribe", "align"],
    languages: "all",
    description: null,
    parameterCount: null,
    requiredVramBytes: null,
    recommendedRamBytes: null,
    downloadSizeBytes: null,
    downloaded: null,
    optionsSchema: {},
    ...overrides,
  };
}

function worker(
  hardware: WorkerHardware | null,
  models: AdapterModel[],
): WorkerManifest {
  return {
    protocolVersion: "1.0",
    workerId: "worker",
    name: "worker",
    version: "1.0.0",
    architecture: "x86_64",
    capabilities: {
      mediaPreparation: null,
      modelCache: null,
      remoteTranscription: null,
    },
    adapters: [
      {
        protocolVersion: "1.0",
        id: "whisperx",
        displayName: "WhisperX",
        version: "1",
        description: null,
        models,
      },
    ],
    hardware,
    modelStorage: null,
  };
}

function cpu(availableGib: number, totalGib = 16): WorkerHardware {
  return {
    device: "cpu",
    cpu: { model: "Test CPU", logicalCores: 8 },
    memory: { totalBytes: totalGib * GIB, availableBytes: availableGib * GIB },
    gpus: [],
  };
}

function cuda(vramGib: number): WorkerHardware {
  return {
    device: "cuda",
    cpu: { model: null, logicalCores: 16 },
    memory: { totalBytes: 32 * GIB, availableBytes: 24 * GIB },
    gpus: [
      { name: "Test GPU", backend: "cuda", totalMemoryBytes: vramGib * GIB },
    ],
  };
}

describe("available transcription models", () => {
  it("combines active worker manifests and deduplicates models", () => {
    const small = model("small", {
      downloadSizeBytes: 486_212_372,
      downloaded: true,
    });
    const models = availableTranscriptionModels(
      [worker(null, [small]), worker(null, [{ ...small, downloaded: false }])],
      "auto",
    );

    expect(models).toEqual([
      expect.objectContaining({
        key: "whisperx:small",
        adapterId: "whisperx",
        modelId: "small",
        downloadSizeBytes: 486_212_372,
        downloaded: true,
        recommended: false,
        fit: "unknown",
      }),
    ]);
  });

  it("scores each model against the worker hardware", () => {
    const models = availableTranscriptionModels(
      [
        worker(cpu(6, 8), [
          model("small", {
            parameterCount: 244_000_000,
            recommendedRamBytes: 4 * GIB,
            downloaded: false,
          }),
          model("medium", { recommendedRamBytes: 8 * GIB }),
        ]),
      ],
      "auto",
    );

    expect(models).toEqual([
      expect.objectContaining({
        modelId: "small",
        parameterCount: 244_000_000,
        fit: "good",
        fitLabel: "Runs well",
        downloaded: false,
        memoryRequirementBytes: 4 * GIB,
        memoryRequirementKind: "ram",
      }),
      expect.objectContaining({
        modelId: "medium",
        fit: "poor",
        fitLabel: "Not recommended",
        fitReason: expect.stringContaining("8.00 GiB"),
        memoryRequirementBytes: 8 * GIB,
        memoryRequirementKind: "ram",
      }),
    ]);
  });

  it("warns when a large model fits RAM but is likely slow on CPU", () => {
    const [medium] = availableTranscriptionModels(
      [worker(cpu(12), [model("medium", { recommendedRamBytes: 8 * GIB })])],
      "auto",
    );

    expect(medium).toEqual(
      expect.objectContaining({
        fit: "caution",
        fitLabel: "May be slow",
        fitReason: expect.stringContaining("supported graphics card"),
        memoryRequirementBytes: 8 * GIB,
        memoryRequirementKind: "ram",
      }),
    );
  });

  it("recommends Large v3 Turbo when it fits a CUDA worker", () => {
    const [turbo] = availableTranscriptionModels(
      [
        worker(cuda(4), [
          model("large-v3-turbo", {
            requiredVramBytes: 3 * GIB,
            recommendedRamBytes: 12 * GIB,
          }),
        ]),
      ],
      "auto",
    );

    expect(turbo).toEqual(
      expect.objectContaining({
        modelId: "large-v3-turbo",
        fit: "good",
        fitLabel: "Runs well",
        recommended: true,
        memoryRequirementBytes: 3 * GIB,
        memoryRequirementKind: "vram",
      }),
    );
  });

  it("scales the memory estimate of models that take the precision", () => {
    const manifests = [
      worker(cuda(4), [
        model("large-v3-turbo", {
          requiredVramBytes: 3 * GIB,
          optionsSchema: { properties: { precision: { type: "string" } } },
        }),
        model("fixed", { requiredVramBytes: 3 * GIB }),
      ]),
    ];

    expect(availableTranscriptionModels(manifests, "precise")).toEqual([
      expect.objectContaining({
        modelId: "large-v3-turbo",
        fit: "poor",
        recommended: false,
        memoryRequirementBytes: 6 * GIB,
      }),
      expect.objectContaining({
        modelId: "fixed",
        fit: "good",
        memoryRequirementBytes: 3 * GIB,
      }),
    ]);
    expect(availableTranscriptionModels(manifests, "memory")).toEqual([
      expect.objectContaining({ modelId: "large-v3-turbo", fit: "good" }),
      expect.objectContaining({ modelId: "fixed", fit: "good" }),
    ]);
  });

  it("reports structured detected hardware without duplicates", () => {
    const local = worker(cpu(12), []);

    expect(detectedWorkerHardware([local, local, worker(null, [])])).toEqual([
      {
        kind: "cpu",
        name: "Test CPU",
        details: ["8 logical cores", "12.0 GiB RAM available"],
      },
    ]);
  });
});
