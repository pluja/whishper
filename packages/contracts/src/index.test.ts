import { describe, expect, it } from "vitest";

import {
  ADAPTER_PROTOCOL_VERSION,
  MEDIA_PREPARATION_VERSION,
  MODEL_CACHE_VERSION,
  parseProtocolMessage,
  TRANSCRIPT_SCHEMA_VERSION,
  validateJobCompletionReport,
  validateJobFailureReport,
  validateWorkerManifest,
  WORKER_PROTOCOL_VERSION,
} from "./index";

const manifest = {
  protocolVersion: WORKER_PROTOCOL_VERSION,
  workerId: "df5e0394-88e1-4ff1-8033-c0a670f0633e",
  name: "Local worker",
  version: "0.1.0",
  architecture: "x86_64",
  capabilities: {
    mediaPreparation: MEDIA_PREPARATION_VERSION,
    modelCache: MODEL_CACHE_VERSION,
    remoteTranscription: null,
  },
  adapters: [
    {
      protocolVersion: ADAPTER_PROTOCOL_VERSION,
      id: "builtin.fake",
      displayName: "Fake",
      version: "1.0.0",
      description: null,
      models: [],
    },
  ],
  hardware: null,
  modelStorage: null,
};

describe("protocol versions", () => {
  it("use explicit major and minor versions", () => {
    for (const version of [
      ADAPTER_PROTOCOL_VERSION,
      WORKER_PROTOCOL_VERSION,
      MEDIA_PREPARATION_VERSION,
      TRANSCRIPT_SCHEMA_VERSION,
    ]) {
      expect(version).toMatch(/^\d+\.\d+$/);
    }
  });
});

describe("parseProtocolMessage", () => {
  it("accepts a worker manifest", () => {
    expect(parseProtocolMessage(validateWorkerManifest, manifest)).toEqual({
      ok: true,
      value: manifest,
    });
  });

  it("reports every violation with its location", () => {
    const result = parseProtocolMessage(validateWorkerManifest, {
      ...manifest,
      protocolVersion: "2.0",
      adapters: [{ ...manifest.adapters[0], id: "" }],
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors).toEqual(
      expect.arrayContaining([
        "/protocolVersion must be equal to constant: 1.0",
        "/adapters/0/id must NOT have fewer than 1 characters",
      ]),
    );
  });

  it("rejects fields the worker never sends", () => {
    const result = parseProtocolMessage(validateJobFailureReport, {
      leaseToken: "token",
      error: { code: "adapter_error", message: "Failed", retryable: false },
      extra: true,
    });

    expect(result).toEqual({
      ok: false,
      errors: ["/ must NOT have additional properties: extra"],
    });
  });

  it("rejects integers beyond the safe range", () => {
    const result = parseProtocolMessage(validateWorkerManifest, {
      ...manifest,
      hardware: {
        device: "cpu",
        cpu: { model: null, logicalCores: 4 },
        memory: { totalBytes: 2 ** 53, availableBytes: 0 },
        gpus: [],
      },
    });

    expect(!result.ok && result.errors).toEqual(
      expect.arrayContaining([
        "/hardware/memory/totalBytes must be <= 9007199254740991",
      ]),
    );
  });

  it("rejects a completion that matches neither job kind", () => {
    const result = parseProtocolMessage(validateJobCompletionReport, {
      leaseToken: "token",
      result: { kind: "diarize" },
    });

    expect(result.ok).toBe(false);
  });
});
