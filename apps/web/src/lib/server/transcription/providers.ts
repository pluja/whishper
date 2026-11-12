import type { RemoteModelAccess } from "@anysub/contracts";
import { and, asc, count, eq, inArray, sum } from "drizzle-orm";

import { db, type Executor } from "#lib/server/db/index.ts";
import {
  providerModels,
  transcriptionProviders,
  transcriptionRuns,
} from "#lib/server/db/schema.ts";
import { withTransaction } from "#lib/server/db/transaction.ts";
import { badRequest, conflict, notFound } from "#lib/server/http/errors.ts";
import {
  MAX_LINE_LENGTH,
  MIN_LINE_LENGTH,
} from "#lib/shared/instance-settings.ts";
import type { Connection } from "#lib/server/transcription/provider-catalog.ts";
import {
  classifyRemoteModel,
  type AdminProvider,
  type AdminProviderModel,
  type NewProviderModel,
} from "#lib/shared/providers.ts";
import {
  modelKey,
  REMOTE_ADAPTER_ID,
  type AvailableTranscriptionModel,
} from "#lib/shared/transcription-models.ts";

const API_KEY_HINT_LENGTH = 4;
// Shorter keys would give most of themselves away in the hint.
const MIN_KEY_LENGTH_FOR_HINT = 16;

// The options a remote model takes. The provider times the words itself, so
// alignment, batch size and precision do not apply.
const REMOTE_OPTIONS_SCHEMA = {
  type: "object",
  properties: {
    maxLineLength: {
      type: "integer",
      minimum: MIN_LINE_LENGTH,
      maximum: MAX_LINE_LENGTH,
    },
  },
  additionalProperties: false,
};

export type ProviderChanges = {
  name: string;
  baseUrl: string;
  // Undefined keeps the stored key, null removes it.
  apiKey: string | null | undefined;
};

export type ModelChanges = {
  displayName: string;
  priceMicrosPerMinute: number | null;
};

export function createProvider(
  changes: ProviderChanges,
  models: NewProviderModel[],
): void {
  withTransaction((tx) => {
    const provider = tx
      .insert(transcriptionProviders)
      .values({
        name: changes.name,
        baseUrl: changes.baseUrl,
        apiKey: changes.apiKey ?? null,
      })
      .returning({ id: transcriptionProviders.id })
      .get();
    if (models.length > 0) {
      tx.insert(providerModels)
        .values(models.map((model) => ({ providerId: provider.id, ...model })))
        .run();
    }
  });
}

export function updateProvider(id: string, changes: ProviderChanges): void {
  const updated = db
    .update(transcriptionProviders)
    .set({
      name: changes.name,
      baseUrl: changes.baseUrl,
      ...(changes.apiKey !== undefined && { apiKey: changes.apiKey }),
    })
    .where(eq(transcriptionProviders.id, id))
    .returning({ id: transcriptionProviders.id })
    .get();
  if (!updated) throw notFound("That provider no longer exists.");
}

// Queued transcriptions of its models fail when a worker asks for them.
export function deleteProvider(id: string): void {
  db.delete(transcriptionProviders)
    .where(eq(transcriptionProviders.id, id))
    .run();
}

export function addProviderModels(
  providerId: string,
  models: NewProviderModel[],
): void {
  for (const model of models) {
    if (classifyRemoteModel(model.remoteId) === "text-only") {
      throw badRequest(
        `${model.remoteId} answers with text only, without the timestamps subtitles need.`,
      );
    }
  }
  withTransaction((tx) => {
    const provider = tx
      .select({ id: transcriptionProviders.id })
      .from(transcriptionProviders)
      .where(eq(transcriptionProviders.id, providerId))
      .get();
    if (!provider) throw notFound("That provider no longer exists.");
    const existing = new Set(
      tx
        .select({ remoteId: providerModels.remoteId })
        .from(providerModels)
        .where(eq(providerModels.providerId, providerId))
        .all()
        .map((row) => row.remoteId),
    );
    const added = models.filter((model) => !existing.has(model.remoteId));
    if (added.length === 0) {
      throw conflict("Those models are already added.");
    }
    tx.insert(providerModels)
      .values(added.map((model) => ({ providerId, ...model })))
      .run();
  });
}

export function updateProviderModel(id: string, changes: ModelChanges): void {
  const updated = db
    .update(providerModels)
    .set(changes)
    .where(eq(providerModels.id, id))
    .returning({ id: providerModels.id })
    .get();
  if (!updated) throw notFound("That model no longer exists.");
}

export function removeProviderModel(id: string): void {
  db.delete(providerModels).where(eq(providerModels.id, id)).run();
}

export function providerConnection(id: string): Connection | null {
  return (
    db
      .select({
        name: transcriptionProviders.name,
        baseUrl: transcriptionProviders.baseUrl,
        apiKey: transcriptionProviders.apiKey,
      })
      .from(transcriptionProviders)
      .where(eq(transcriptionProviders.id, id))
      .get() ?? null
  );
}

export function providerRemoteIds(id: string): Set<string> {
  return new Set(
    db
      .select({ remoteId: providerModels.remoteId })
      .from(providerModels)
      .where(eq(providerModels.providerId, id))
      .all()
      .map((row) => row.remoteId),
  );
}

export function adminProviders(executor: Executor = db): AdminProvider[] {
  const providers = executor
    .select()
    .from(transcriptionProviders)
    .orderBy(asc(transcriptionProviders.name))
    .all();
  const models = executor
    .select()
    .from(providerModels)
    .orderBy(asc(providerModels.displayName))
    .all();
  const usage = modelUsage(
    executor,
    models.map((model) => model.id),
  );
  return providers.map((provider) => ({
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    host: hostOf(provider.baseUrl),
    hasApiKey: provider.apiKey !== null,
    apiKeyHint: keyHint(provider.apiKey),
    models: models
      .filter((model) => model.providerId === provider.id)
      .map((model): AdminProviderModel => ({
        id: model.id,
        remoteId: model.remoteId,
        displayName: model.displayName,
        priceMicrosPerMinute: model.priceMicrosPerMinute,
        completedRuns: usage.get(model.id)?.runs ?? 0,
        estimatedSpendMicros: usage.get(model.id)?.spend ?? 0,
      })),
  }));
}

export function remoteTranscriptionModels(
  executor: Executor,
): AvailableTranscriptionModel[] {
  return executor
    .select({
      id: providerModels.id,
      displayName: providerModels.displayName,
      remoteId: providerModels.remoteId,
      priceMicrosPerMinute: providerModels.priceMicrosPerMinute,
      providerName: transcriptionProviders.name,
      baseUrl: transcriptionProviders.baseUrl,
    })
    .from(providerModels)
    .innerJoin(
      transcriptionProviders,
      eq(transcriptionProviders.id, providerModels.providerId),
    )
    .orderBy(asc(transcriptionProviders.name), asc(providerModels.displayName))
    .all()
    .map((row) => {
      const host = hostOf(row.baseUrl);
      return {
        key: modelKey(REMOTE_ADAPTER_ID, row.id),
        adapterId: REMOTE_ADAPTER_ID,
        adapterName: row.providerName,
        modelId: row.id,
        displayName: row.displayName,
        description:
          row.displayName === row.remoteId
            ? `The audio is sent to ${host}.`
            : `${row.remoteId}. The audio is sent to ${host}.`,
        parameterCount: null,
        downloadSizeBytes: null,
        downloaded: null,
        recommended: false,
        memoryRequirementBytes: null,
        memoryRequirementKind: null,
        fit: "good",
        fitLabel: row.providerName,
        fitReason: `Runs on ${row.providerName}, not on this server.`,
        remote: {
          providerName: row.providerName,
          host,
          priceMicrosPerMinute: row.priceMicrosPerMinute,
        },
        optionsSchema: REMOTE_OPTIONS_SCHEMA,
      };
    });
}

// Read when a worker leases the job, so the key is never stored in it.
export function remoteModelAccess(
  executor: Executor,
  modelId: string,
): RemoteModelAccess | null {
  const row = executor
    .select({
      providerName: transcriptionProviders.name,
      baseUrl: transcriptionProviders.baseUrl,
      apiKey: transcriptionProviders.apiKey,
      model: providerModels.remoteId,
    })
    .from(providerModels)
    .innerJoin(
      transcriptionProviders,
      eq(transcriptionProviders.id, providerModels.providerId),
    )
    .where(eq(providerModels.id, modelId))
    .get();
  return row ?? null;
}

function modelUsage(
  executor: Executor,
  modelIds: string[],
): Map<string, { runs: number; spend: number }> {
  if (modelIds.length === 0) return new Map();
  const rows = executor
    .select({
      modelId: transcriptionRuns.modelId,
      runs: count(),
      spend: sum(transcriptionRuns.estimatedCostMicros).mapWith(Number),
    })
    .from(transcriptionRuns)
    .where(
      and(
        eq(transcriptionRuns.adapterId, REMOTE_ADAPTER_ID),
        eq(transcriptionRuns.status, "completed"),
        inArray(transcriptionRuns.modelId, modelIds),
      ),
    )
    .groupBy(transcriptionRuns.modelId)
    .all();
  return new Map(
    rows.map((row) => [row.modelId, { runs: row.runs, spend: row.spend || 0 }]),
  );
}

export function hostOf(baseUrl: string): string {
  return new URL(baseUrl).host;
}

function keyHint(apiKey: string | null): string | null {
  if (!apiKey || apiKey.length < MIN_KEY_LENGTH_FOR_HINT) return null;
  return apiKey.slice(-API_KEY_HINT_LENGTH);
}
