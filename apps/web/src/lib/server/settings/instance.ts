import { db, type Executor } from "$lib/server/db";
import { instanceSettings } from "$lib/server/db/schema";
import {
  DEFAULT_INSTANCE_SETTINGS,
  GIB,
  isPrecision,
  MAX_LINE_LENGTH,
  MAX_UPLOAD_LIMIT_GIB,
  MIN_LINE_LENGTH,
  MIN_UPLOAD_LIMIT_GIB,
  type InstanceSettings,
  type TranscriptionDefaults,
} from "$lib/shared/instance-settings";
import { DETECT_LANGUAGE, LANGUAGE_TAG } from "$lib/shared/languages";
import { parseModelKey } from "$lib/shared/transcription-models";

export const AUTOMATIC_MODEL = "auto";
export const CUSTOM_UPLOAD_LIMIT = "custom";

export type SettingsProblem = { field: string; message: string };
type Parsed<T> = { value: T } | { problem: SettingsProblem };

export function readInstanceSettings(
  executor: Executor = db,
): InstanceSettings {
  const row = executor.select().from(instanceSettings).get();
  if (!row) return DEFAULT_INSTANCE_SETTINGS;
  return {
    model: row.defaultModel,
    language: row.defaultLanguage,
    alignment: row.wordAlignment,
    maxLineLength: row.maxLineLength,
    precision: row.precision,
    maxUploadBytes: row.maxUploadBytes,
  };
}

export function readTranscriptionDefaults(
  executor: Executor = db,
): TranscriptionDefaults {
  const { model, language, alignment, maxLineLength, precision } =
    readInstanceSettings(executor);
  return { model, language, alignment, maxLineLength, precision };
}

export function updateInstanceSettings(
  changes: Partial<InstanceSettings>,
  executor: Executor = db,
): void {
  const values = {
    ...(changes.model !== undefined && { defaultModel: changes.model }),
    ...(changes.language !== undefined && {
      defaultLanguage: changes.language,
    }),
    ...(changes.alignment !== undefined && {
      wordAlignment: changes.alignment,
    }),
    ...(changes.maxLineLength !== undefined && {
      maxLineLength: changes.maxLineLength,
    }),
    ...(changes.precision !== undefined && { precision: changes.precision }),
    ...(changes.maxUploadBytes !== undefined && {
      maxUploadBytes: changes.maxUploadBytes,
    }),
    updatedAt: new Date(),
  };
  executor
    .insert(instanceSettings)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({ target: instanceSettings.id, set: values })
    .run();
}

export function parseTranscriptionDefaults(
  form: FormData,
): Parsed<TranscriptionDefaults> {
  const model = String(form.get("model") ?? AUTOMATIC_MODEL);
  const language = String(form.get("language") ?? DETECT_LANGUAGE).trim();
  const maxLineLength = Number(form.get("maxLineLength"));
  const precision = String(form.get("precision") ?? "");

  if (model !== AUTOMATIC_MODEL && !parseModelKey(model)) {
    return problem("model", "Choose a model from the list.");
  }
  if (language !== DETECT_LANGUAGE && !LANGUAGE_TAG.test(language)) {
    return problem("language", "Choose a language from the list.");
  }
  if (
    !Number.isInteger(maxLineLength) ||
    maxLineLength < MIN_LINE_LENGTH ||
    maxLineLength > MAX_LINE_LENGTH
  ) {
    return problem(
      "maxLineLength",
      `Use a length between ${MIN_LINE_LENGTH} and ${MAX_LINE_LENGTH} characters.`,
    );
  }
  if (!isPrecision(precision)) {
    return problem("precision", "Choose one of the precision options.");
  }
  return {
    value: {
      model: model === AUTOMATIC_MODEL ? null : model,
      language: language === DETECT_LANGUAGE ? null : language,
      alignment: form.get("alignment") === "on",
      maxLineLength,
      precision,
    },
  };
}

export function parseUploadLimit(form: FormData): Parsed<number> {
  const choice = String(form.get("uploadLimit") ?? "");
  const gibibytes = Number(
    choice === CUSTOM_UPLOAD_LIMIT ? form.get("customUploadLimit") : choice,
  );
  if (
    !Number.isFinite(gibibytes) ||
    gibibytes < MIN_UPLOAD_LIMIT_GIB ||
    gibibytes > MAX_UPLOAD_LIMIT_GIB
  ) {
    return problem(
      choice === CUSTOM_UPLOAD_LIMIT ? "customUploadLimit" : "uploadLimit",
      `Enter a limit between ${MIN_UPLOAD_LIMIT_GIB} and ${MAX_UPLOAD_LIMIT_GIB.toLocaleString("en")} GiB.`,
    );
  }
  return { value: Math.round(gibibytes * GIB) };
}

function problem(field: string, message: string): { problem: SettingsProblem } {
  return { problem: { field, message } };
}
