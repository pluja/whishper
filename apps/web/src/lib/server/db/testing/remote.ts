import { randomUUID } from "node:crypto";

import type { WorkerManifest } from "@anysub/contracts";

import { db } from "#lib/server/db/index.ts";
import { jobs } from "#lib/server/db/schema.ts";
import { seedProject } from "#lib/server/db/testing/fixtures.ts";
import { enqueueTranscription } from "#lib/server/transcription/enqueue.ts";
import {
  addProviderModels,
  adminProviders,
  createProvider,
  updateProviderModel,
} from "#lib/server/transcription/providers.ts";
import { recordWorkerPresence } from "#lib/server/workers/presence.ts";
import { REMOTE_ADAPTER_ID } from "#lib/shared/transcription-models.ts";

export const TEST_API_KEY = "gsk_0123456789abcdefWXYZ";

export function answering(
  response: Response,
  seen: Request[] = [],
): typeof fetch {
  return async (input, init) => {
    seen.push(new Request(input, init));
    return response.clone();
  };
}

export function remoteWorker(remote: boolean): WorkerManifest {
  return {
    protocolVersion: "1.0",
    workerId: randomUUID(),
    name: remote ? "remote-worker" : "old-worker",
    version: "1.0.0",
    architecture: "x86_64",
    capabilities: {
      mediaPreparation: null,
      modelCache: null,
      remoteTranscription: remote ? "1.0" : null,
    },
    adapters: [],
    hardware: null,
    modelStorage: null,
  };
}

export function connectWorker(manifest: WorkerManifest): WorkerManifest {
  recordWorkerPresence(db, manifest);
  return manifest;
}

export function seedRemoteModel(price: number | null = 6_000): {
  providerId: string;
  modelId: string;
} {
  createProvider(
    {
      name: "Groq",
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: TEST_API_KEY,
    },
    [],
  );
  const providerId = adminProviders(db)[0]?.id;
  if (!providerId) throw new Error("Expected a provider");
  addProviderModels(providerId, [
    { remoteId: "whisper-large-v3", displayName: "Whisper Large v3" },
  ]);
  const model = adminProviders(db)[0]?.models[0];
  if (!model) throw new Error("Expected a model");
  updateProviderModel(model.id, {
    displayName: model.displayName,
    priceMicrosPerMinute: price,
  });
  return { providerId, modelId: model.id };
}

export function enqueueRemote(modelId: string) {
  const project = seedProject({ mediaOriginalKey: "media/source.mp4" });
  enqueueTranscription(project.projectId, project.userId, {
    adapterId: REMOTE_ADAPTER_ID,
    modelId,
    language: null,
    options: { alignment: true, maxLineLength: 32, batchSize: 8 },
  });
  return project;
}

export function onlyJob() {
  const job = db.select().from(jobs).get();
  if (!job) throw new Error("Expected a job");
  return job;
}
