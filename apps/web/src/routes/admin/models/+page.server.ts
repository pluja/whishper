import type { ModelCacheAction } from "@anysub/contracts";

import { requireAdminOrLogin } from "$lib/server/auth/session";
import { db } from "$lib/server/db";
import { runFormAction } from "$lib/server/http/actions";
import { badRequest, conflict } from "$lib/server/http/errors";
import { workerModelInventories } from "$lib/server/models/inventory";
import {
  cancelModelTask,
  requestModelTask,
  type ModelTaskRequest,
} from "$lib/server/models/tasks";
import { readTranscriptionDefaults } from "$lib/server/settings/instance";
import { isUuid } from "$lib/shared/uuid";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals }) => {
  requireAdminOrLogin(locals);
  return {
    workers: workerModelInventories(db),
    defaultModel: readTranscriptionDefaults(db).model,
  };
};

function modelTask(form: FormData, action: ModelCacheAction): ModelTaskRequest {
  const workerId = String(form.get("workerId") ?? "");
  const adapterId = String(form.get("adapterId") ?? "");
  const modelId = String(form.get("modelId") ?? "");
  if (!isUuid(workerId) || !adapterId || !modelId) {
    throw badRequest("Choose a model from the list.");
  }
  return { workerId, adapterId, modelId, action };
}

export const actions: Actions = {
  download: async ({ locals, request }) => {
    requireAdminOrLogin(locals);
    const form = await request.formData();
    return runFormAction(() => requestModelTask(modelTask(form, "download")));
  },
  remove: async ({ locals, request }) => {
    requireAdminOrLogin(locals);
    const form = await request.formData();
    return runFormAction(() => requestModelTask(modelTask(form, "delete")));
  },
  cancel: async ({ locals, request }) => {
    requireAdminOrLogin(locals);
    const jobId = String((await request.formData()).get("jobId") ?? "");
    return runFormAction(() => {
      if (!isUuid(jobId) || !cancelModelTask(jobId)) {
        throw conflict("That download or removal has already finished.");
      }
    });
  },
};
