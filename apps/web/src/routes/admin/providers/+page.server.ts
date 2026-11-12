import { requireAdminOrLogin } from "#lib/server/auth/session.ts";
import { db } from "#lib/server/db/index.ts";
import { runFormAction } from "#lib/server/http/actions.ts";
import { notFound } from "#lib/server/http/errors.ts";
import { listCatalogModels } from "#lib/server/transcription/provider-catalog.ts";
import {
  addProvider,
  saveProvider,
} from "#lib/server/transcription/provider-setup.ts";
import {
  parseAddedModels,
  parseModelForm,
  parseProviderForm,
  requireId,
} from "#lib/server/transcription/provider-forms.ts";
import {
  addProviderModels,
  adminProviders,
  deleteProvider,
  providerConnection,
  providerRemoteIds,
  removeProviderModel,
  updateProviderModel,
} from "#lib/server/transcription/providers.ts";
import { supportsRemoteTranscription } from "#lib/server/transcription/models.ts";
import { activeWorkerManifests } from "#lib/server/workers/presence.ts";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals }) => {
  requireAdminOrLogin(locals);
  return {
    providers: adminProviders(db),
    remoteWorkerConnected: activeWorkerManifests(db).some(
      supportsRemoteTranscription,
    ),
  };
};

export const actions: Actions = {
  createProvider: async ({ locals, request }) => {
    requireAdminOrLogin(locals);
    const form = await request.formData();
    return runFormAction(async () => ({
      added: await addProvider(parseProviderForm(form, { editing: false }), {
        noModelList: form.get("noModelList") === "on",
      }),
    }));
  },
  updateProvider: async ({ locals, request }) => {
    requireAdminOrLogin(locals);
    const form = await request.formData();
    return runFormAction(() =>
      saveProvider(
        requireId(form, "providerId"),
        parseProviderForm(form, { editing: true }),
        { noModelList: form.get("noModelList") === "on" },
      ),
    );
  },
  deleteProvider: async ({ locals, request }) => {
    requireAdminOrLogin(locals);
    const form = await request.formData();
    return runFormAction(() => deleteProvider(requireId(form, "providerId")));
  },
  findModels: async ({ locals, request }) => {
    requireAdminOrLogin(locals);
    const form = await request.formData();
    return runFormAction(async () => {
      const providerId = requireId(form, "providerId");
      const connection = providerConnection(providerId);
      if (!connection) throw notFound("That provider no longer exists.");
      const models = await listCatalogModels(
        connection,
        providerRemoteIds(providerId),
      );
      return { catalog: { providerId, models } };
    });
  },
  addModels: async ({ locals, request }) => {
    requireAdminOrLogin(locals);
    const form = await request.formData();
    return runFormAction(() =>
      addProviderModels(requireId(form, "providerId"), parseAddedModels(form)),
    );
  },
  updateModel: async ({ locals, request }) => {
    requireAdminOrLogin(locals);
    const form = await request.formData();
    return runFormAction(() =>
      updateProviderModel(requireId(form, "modelId"), parseModelForm(form)),
    );
  },
  removeModel: async ({ locals, request }) => {
    requireAdminOrLogin(locals);
    const form = await request.formData();
    return runFormAction(() => removeProviderModel(requireId(form, "modelId")));
  },
};
