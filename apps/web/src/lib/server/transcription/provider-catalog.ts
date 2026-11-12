import { conflict } from "#lib/server/http/errors.ts";
import { isRecord } from "#lib/shared/is-record.ts";
import {
  classifyRemoteModel,
  type CatalogModel,
} from "#lib/shared/providers.ts";

const LIST_TIMEOUT_MS = 15_000;
const MAX_LISTED_MODELS = 2_000;
const MAX_DETAIL_LENGTH = 200;
// A model list is a few kilobytes. A server answering with far more is not one,
// and reading it whole would only use up memory.
const MAX_LIST_BYTES = 4 * 1024 * 1024;
const MAX_DETAIL_BYTES = 64 * 1024;
const KIND_ORDER = { speech: 0, other: 1, "text-only": 2 } as const;

export type Connection = {
  name: string;
  baseUrl: string;
  apiKey: string | null;
};

// Lists what the provider offers, with likely transcription models first. The
// administrator chooses which ones Anysub shows.
export async function listCatalogModels(
  connection: Connection,
  added: Set<string>,
  fetcher: typeof fetch = fetch,
): Promise<CatalogModel[]> {
  const listed = await fetchModelList(connection, fetcher);
  if (listed === null) {
    throw conflict(
      `${connection.name} has no model list at this base URL. Check the URL, or add models by their ID.`,
    );
  }
  return listed
    .map(({ remoteId, type }) => ({
      remoteId,
      kind: classifyRemoteModel(remoteId, type),
      added: added.has(remoteId),
    }))
    .sort(
      (left, right) =>
        KIND_ORDER[left.kind] - KIND_ORDER[right.kind] ||
        left.remoteId.localeCompare(right.remoteId),
    );
}

export type ListedModel = { remoteId: string; type: string | null };

// Also checks the connection: it throws when the server cannot be reached or
// rejects the key. Null means the server works but has no model list, which
// some self-hosted servers leave out.
export async function fetchModelList(
  { name, baseUrl, apiKey }: Connection,
  fetcher: typeof fetch = fetch,
): Promise<ListedModel[] | null> {
  let response: Response;
  try {
    response = await fetcher(`${baseUrl}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
      // A redirect could carry the request, and its answer, to another server.
      redirect: "manual",
    });
  } catch (cause) {
    throw conflict(`Could not reach ${name}: ${describeCause(cause)}.`);
  }
  if (response.status >= 300 && response.status < 400) {
    throw conflict(
      `${name} redirects to another address. Use the final address as the base URL.`,
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw conflict(`${name} rejected the API key.`);
  }
  if (response.status === 404) return null;
  if (!response.ok) {
    throw conflict(
      `${name} answered with HTTP ${response.status}${await detail(response)}.`,
    );
  }
  let body: unknown;
  try {
    body = JSON.parse(await readLimited(response, MAX_LIST_BYTES));
  } catch {
    throw conflict(
      `${name} did not answer with a model list. Check that the base URL points to an OpenAI-compatible API.`,
    );
  }
  const entries = isRecord(body) && Array.isArray(body.data) ? body.data : body;
  if (!Array.isArray(entries)) {
    throw conflict(`${name} did not answer with a model list.`);
  }
  const models = new Map<string, ListedModel>();
  for (const entry of entries) {
    if (!isRecord(entry) || typeof entry.id !== "string" || !entry.id) continue;
    const type = typeof entry.type === "string" ? entry.type : null;
    models.set(entry.id, { remoteId: entry.id, type });
  }
  return [...models.values()].slice(0, MAX_LISTED_MODELS);
}

async function detail(response: Response): Promise<string> {
  const text = await readLimited(response, MAX_DETAIL_BYTES).catch(() => "");
  let message = text;
  try {
    const body: unknown = JSON.parse(text);
    if (isRecord(body) && isRecord(body.error)) {
      message = String(body.error.message ?? "");
    }
  } catch {
    // Not JSON: the raw text is the detail.
  }
  const collapsed = message
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return collapsed ? `: ${collapsed.slice(0, MAX_DETAIL_LENGTH)}` : "";
}

function describeCause(cause: unknown): string {
  if (cause instanceof DOMException && cause.name === "TimeoutError") {
    return `it did not answer within ${LIST_TIMEOUT_MS / 1000} seconds`;
  }
  if (cause instanceof Error) {
    const reason = cause.cause instanceof Error ? cause.cause.message : "";
    return reason || cause.message;
  }
  return "unknown error";
}

async function readLimited(
  response: Response,
  maxBytes: number,
): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new RangeError(`The answer is larger than ${maxBytes} bytes.`);
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
