import type { ApiModel } from "#lib/server/api/schemas.ts";
import { TRANSCRIPTION_OPTIONS } from "#lib/server/api/schemas.ts";
import { db } from "#lib/server/db/index.ts";
import { readTranscriptionDefaults } from "#lib/server/settings/instance.ts";
import { transcriptionModelChoices } from "#lib/server/transcription/models.ts";
import { activeWorkerManifests } from "#lib/server/workers/presence.ts";
import { microsToDollars } from "#lib/shared/money.ts";
import {
  acceptsOption,
  defaultModelKey,
} from "#lib/shared/transcription-models.ts";

// The same choices as the transcribe form, for the workers connected now.
export function modelsForApi(): ApiModel[] {
  const defaults = readTranscriptionDefaults(db);
  const models = transcriptionModelChoices(
    db,
    activeWorkerManifests(db),
    defaults.precision,
  );
  const defaultKey = defaultModelKey(models, defaults.model);
  return models.map((model) => ({
    id: model.key,
    name: model.displayName,
    kind: model.remote ? "external" : "local",
    provider: model.remote?.providerName ?? null,
    pricePerMinuteUsd:
      model.remote?.priceMicrosPerMinute == null
        ? null
        : microsToDollars(model.remote.priceMicrosPerMinute),
    isDefault: model.key === defaultKey,
    options: TRANSCRIPTION_OPTIONS.filter((option) =>
      acceptsOption(model.optionsSchema, option),
    ),
  }));
}
