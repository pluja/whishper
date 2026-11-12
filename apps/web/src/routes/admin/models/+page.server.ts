import type { ModelCacheAction } from "@anysub/contracts";

import { requireAdminOrLogin } from "#lib/server/auth/session.ts";
import { db } from "#lib/server/db/index.ts";
import { runFormAction } from "#lib/server/http/actions.ts";
import { badRequest, conflict } from "#lib/server/http/errors.ts";
import { workerModelInventories } from "#lib/server/models/inventory.ts";
import {
  cancelModelTask,
  requestModelTask,
  type ModelTaskRequest,
} from "#lib/server/models/tasks.ts";
import { readTranscriptionDefaults } from "#lib/server/settings/instance.ts";
import { isUuid } from "#lib/shared/uuid.ts";
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
