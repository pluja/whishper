import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "#lib/server/db/index.ts";
import { transcriptionRuns } from "#lib/server/db/schema.ts";
import {
  connectWorker,
  enqueueRemote,
  remoteWorker,
  seedRemoteModel,
  TEST_API_KEY,
} from "#lib/server/db/testing/remote.ts";
import { transcriptionModelChoices } from "#lib/server/transcription/models.ts";
import {
  addProviderModels,
  adminProviders,
  deleteProvider,
} from "#lib/server/transcription/providers.ts";
import { REMOTE_ADAPTER_ID } from "#lib/shared/transcription-models.ts";

describe("providers", () => {
  it("offer their models only while a worker can run them", () => {
    seedRemoteModel();
    const old = remoteWorker(false);

    expect(transcriptionModelChoices(db, [old], "auto")).toEqual([]);

    const models = transcriptionModelChoices(
      db,
      [old, remoteWorker(true)],
      "auto",
    );
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({
      adapterId: REMOTE_ADAPTER_ID,
      displayName: "Whisper Large v3",
      remote: {
        providerName: "Groq",
        host: "api.groq.com",
        priceMicrosPerMinute: 6_000,
      },
    });
  });

  it("never show the API key, only its last characters", () => {
    seedRemoteModel();

    const [provider] = adminProviders(db);

    expect(provider).toMatchObject({ hasApiKey: true, apiKeyHint: "WXYZ" });
    expect(JSON.stringify(provider)).not.toContain(TEST_API_KEY);
  });

  it("refuse models that answer without timestamps", () => {
    const { providerId } = seedRemoteModel();

    expect(() =>
      addProviderModels(providerId, [
        { remoteId: "gpt-4o-transcribe", displayName: "GPT-4o" },
      ]),
    ).toThrow("without the timestamps");
  });

  it("add each model once", () => {
    const { providerId } = seedRemoteModel();

    expect(() =>
      addProviderModels(providerId, [
        { remoteId: "whisper-large-v3", displayName: "Again" },
      ]),
    ).toThrow("already added");
    addProviderModels(providerId, [
      { remoteId: "whisper-large-v3", displayName: "Again" },
      { remoteId: "whisper-large-v3-turbo", displayName: "Turbo" },
    ]);
    expect(
      adminProviders(db)[0]?.models.map((model) => model.remoteId),
    ).toEqual(["whisper-large-v3-turbo", "whisper-large-v3"]);
  });

  it("count completed transcriptions and their estimated cost", () => {
    connectWorker(remoteWorker(true));
    const { modelId } = seedRemoteModel(6_000);
    enqueueRemote(modelId);
    enqueueRemote(modelId);
    enqueueRemote(modelId);
    const [first, second] = db.select().from(transcriptionRuns).all();
    for (const run of [first, second]) {
      if (!run) throw new Error("Expected a run");
      db.update(transcriptionRuns)
        .set({ status: "completed", estimatedCostMicros: 6_000 })
        .where(eq(transcriptionRuns.id, run.id))
        .run();
    }

    expect(adminProviders(db)[0]?.models[0]).toMatchObject({
      completedRuns: 2,
      estimatedSpendMicros: 12_000,
    });
  });

  it("take their models with them when deleted", () => {
    const { providerId } = seedRemoteModel();

    deleteProvider(providerId);

    expect(adminProviders(db)).toEqual([]);
    expect(transcriptionModelChoices(db, [remoteWorker(true)], "auto")).toEqual(
      [],
    );
  });
});
