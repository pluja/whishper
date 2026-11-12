import { randomUUID } from "node:crypto";

import type { AdapterModel, TranscriptionJobPayload } from "@anysub/contracts";
import { describe, expect, it } from "vitest";

import { db } from "#lib/server/db/index.ts";
import { jobs } from "#lib/server/db/schema.ts";
import { seedProject } from "#lib/server/db/testing/fixtures.ts";
import { updateInstanceSettings } from "#lib/server/settings/instance.ts";
import { enqueueTranscription } from "#lib/server/transcription/enqueue.ts";
import { recordWorkerPresence } from "#lib/server/workers/presence.ts";

function connectWorker(optionsSchema: Record<string, unknown>): void {
  const model: AdapterModel = {
    id: "small",
    displayName: "Small",
    capabilities: ["transcribe"],
    languages: "all",
    description: null,
    parameterCount: null,
    requiredVramBytes: null,
    recommendedRamBytes: null,
    downloadSizeBytes: null,
    downloaded: true,
    optionsSchema,
  };
  recordWorkerPresence(db, {
    protocolVersion: "1.0",
    workerId: randomUUID(),
    name: "local-worker",
    version: "1.0.0",
    architecture: "x86_64",
    capabilities: { mediaPreparation: null, modelCache: null },
    adapters: [
      {
        protocolVersion: "1.0",
        id: "whisperx",
        displayName: "WhisperX",
        version: "1.0.0",
        description: null,
        models: [model],
      },
    ],
    hardware: null,
    modelStorage: null,
  });
}

function transcribe(): TranscriptionJobPayload["options"] {
  const project = seedProject({ mediaOriginalKey: "media/source.wav" });
  enqueueTranscription(project.projectId, project.userId, {
    adapterId: "whisperx",
    modelId: "small",
    language: null,
    options: { alignment: true, maxLineLength: 42 },
  });
  const job = db.select({ payload: jobs.payload }).from(jobs).get();
  if (job?.payload.kind !== "transcribe") throw new Error("Expected a job");
  return job.payload.options;
}

describe("enqueueTranscription", () => {
  it("applies the administrator's precision to adapters that offer it", () => {
    connectWorker({ properties: { precision: { type: "string" } } });
    updateInstanceSettings({ precision: "precise" });

    expect(transcribe()).toEqual({
      alignment: true,
      maxLineLength: 42,
      precision: "precise",
    });
  });

  it("leaves precision out for adapters without it", () => {
    connectWorker({ properties: {} });
    updateInstanceSettings({ precision: "memory" });

    expect(transcribe()).not.toHaveProperty("precision");
  });
});
