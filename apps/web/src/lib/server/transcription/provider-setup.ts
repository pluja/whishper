import { badRequest, conflict, notFound } from "#lib/server/http/errors.ts";
import {
  fetchModelList,
  type Connection,
  type ListedModel,
} from "#lib/server/transcription/provider-catalog.ts";
import {
  createProvider,
  hostOf,
  providerConnection,
  updateProvider,
  type ProviderChanges,
} from "#lib/server/transcription/providers.ts";
import {
  classifyRemoteModel,
  type ProviderSetup,
} from "#lib/shared/providers.ts";

type SetupOptions = {
  // The administrator said the server has no /models list, so its address
  // cannot be checked that way.
  noModelList: boolean;
  fetcher?: typeof fetch;
};

// Saves the provider only once it answers, and adds its transcription models
// so it is ready to use right away.
export async function addProvider(
  changes: ProviderChanges,
  { noModelList, fetcher = fetch }: SetupOptions,
): Promise<ProviderSetup> {
  const listed = noModelList
    ? []
    : await requireModelList(
        {
          name: changes.name,
          baseUrl: changes.baseUrl,
          apiKey: changes.apiKey ?? null,
        },
        fetcher,
      );
  const speech = listed
    .filter(
      ({ remoteId, type }) => classifyRemoteModel(remoteId, type) === "speech",
    )
    .map(({ remoteId }) => remoteId)
    .sort();
  createProvider(
    changes,
    speech.map((remoteId) => ({ remoteId, displayName: remoteId })),
  );
  return {
    name: changes.name,
    addedModels: speech.length,
    hasModelList: !noModelList,
  };
}

export async function saveProvider(
  id: string,
  changes: ProviderChanges,
  { noModelList, fetcher = fetch }: SetupOptions,
): Promise<void> {
  const current = providerConnection(id);
  if (!current) throw notFound("That provider no longer exists.");
  const connection = nextConnection(current, changes);
  // Removing the key needs no check: a hosted service would only reject the
  // request without it.
  const connectionChanged =
    connection.baseUrl !== current.baseUrl ||
    typeof changes.apiKey === "string";
  if (connectionChanged && !noModelList) {
    await requireModelList(connection, fetcher);
  }
  updateProvider(id, changes);
}

async function requireModelList(
  connection: Connection,
  fetcher: typeof fetch,
): Promise<ListedModel[]> {
  const listed = await fetchModelList(connection, fetcher);
  if (listed === null) {
    throw conflict(
      `${connection.name} has no model list at ${connection.baseUrl}/models. Check the base URL, which usually ends in /v1. If this server has no model list, tick that option and add its models by ID.`,
    );
  }
  return listed;
}

function nextConnection(
  current: Connection,
  changes: ProviderChanges,
): Connection {
  if (changes.apiKey !== undefined) {
    return {
      name: changes.name,
      baseUrl: changes.baseUrl,
      apiKey: changes.apiKey,
    };
  }
  // The saved key belongs to the old host. Sending it to a new one could leak
  // it, through a typo or to a server someone else runs.
  if (
    current.apiKey !== null &&
    hostOf(changes.baseUrl) !== hostOf(current.baseUrl)
  ) {
    throw badRequest(
      "The base URL now points to another server. Enter its API key, or remove the saved key.",
    );
  }
  return {
    name: changes.name,
    baseUrl: changes.baseUrl,
    apiKey: current.apiKey,
  };
}
