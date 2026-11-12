import { badRequest } from "#lib/server/http/errors.ts";
import type {
  ModelChanges,
  ProviderChanges,
} from "#lib/server/transcription/providers.ts";
import {
  MAX_PRICE_MICROS_PER_MINUTE,
  parseUsdMicros,
} from "#lib/shared/money.ts";
import {
  PROVIDER_NAME_MAX_LENGTH as MAX_NAME_LENGTH,
  type NewProviderModel,
} from "#lib/shared/providers.ts";
import { isUuid } from "#lib/shared/uuid.ts";

const MAX_KEY_LENGTH = 512;
const MAX_REMOTE_ID_LENGTH = 200;
const MAX_MODELS_PER_ADD = 50;
const REMOTE_ID = /^[^\s\p{Cc}]+$/u;

export function parseProviderForm(
  form: FormData,
  { editing }: { editing: boolean },
): ProviderChanges {
  const name = text(form, "name");
  if (!name || name.length > MAX_NAME_LENGTH) {
    throw badRequest(
      `Give the provider a name of up to ${MAX_NAME_LENGTH} characters.`,
    );
  }
  return {
    name,
    baseUrl: parseBaseUrl(text(form, "baseUrl")),
    apiKey: parseApiKey(form, editing),
  };
}

export function parseBaseUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw badRequest(
      "Enter the API's base URL, such as https://api.openai.com/v1.",
    );
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw badRequest("The base URL must start with https:// or http://.");
  }
  if (url.username || url.password) {
    throw badRequest("Put the API key in its own field, not in the base URL.");
  }
  if (url.search || url.hash) {
    throw badRequest("The base URL cannot have a query or a fragment.");
  }
  return url.href.replace(/\/+$/, "");
}

// When editing, an empty key field keeps the stored key, so the form never
// has to show it.
function parseApiKey(
  form: FormData,
  editing: boolean,
): string | null | undefined {
  if (form.get("removeApiKey") === "on") return null;
  const apiKey = text(form, "apiKey");
  if (!apiKey) return editing ? undefined : null;
  if (apiKey.length > MAX_KEY_LENGTH || /\s/.test(apiKey)) {
    throw badRequest("That API key does not look right. Paste it again.");
  }
  return apiKey;
}

export function parseModelForm(form: FormData): ModelChanges {
  const displayName = text(form, "displayName");
  if (!displayName || displayName.length > MAX_NAME_LENGTH) {
    throw badRequest(
      `Give the model a name of up to ${MAX_NAME_LENGTH} characters.`,
    );
  }
  const price = parseUsdMicros(text(form, "price"));
  if (
    price === undefined ||
    (price !== null && price > MAX_PRICE_MICROS_PER_MINUTE)
  ) {
    throw badRequest(
      "Enter the price in US dollars per minute, such as 0.006, or leave it empty.",
    );
  }
  return { displayName, priceMicrosPerMinute: price };
}

export function parseAddedModels(form: FormData): NewProviderModel[] {
  const remoteIds = form
    .getAll("remoteId")
    .map((value) => String(value).trim())
    .filter(Boolean);
  if (remoteIds.length === 0) {
    throw badRequest("Choose at least one model, or type its ID.");
  }
  if (remoteIds.length > MAX_MODELS_PER_ADD) {
    throw badRequest(`Add at most ${MAX_MODELS_PER_ADD} models at a time.`);
  }
  const displayName = text(form, "displayName");
  if (displayName.length > MAX_NAME_LENGTH) {
    throw badRequest(`Keep the name to ${MAX_NAME_LENGTH} characters.`);
  }
  return [...new Set(remoteIds)].map((remoteId) => {
    if (remoteId.length > MAX_REMOTE_ID_LENGTH || !REMOTE_ID.test(remoteId)) {
      throw badRequest(`${remoteId.slice(0, 40)} is not a valid model ID.`);
    }
    return {
      remoteId,
      displayName:
        remoteIds.length === 1 && displayName ? displayName : remoteId,
    };
  });
}

export function requireId(form: FormData, field: string): string {
  const id = text(form, field);
  if (!isUuid(id)) throw badRequest("Choose an item from the list.");
  return id;
}

function text(form: FormData, field: string): string {
  return String(form.get(field) ?? "").trim();
}
