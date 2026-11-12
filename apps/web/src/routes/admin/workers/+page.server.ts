import { requireAdminOrLogin } from "#lib/server/auth/session.ts";
import { db } from "#lib/server/db/index.ts";
import { runFormAction } from "#lib/server/http/actions.ts";
import { badRequest } from "#lib/server/http/errors.ts";
import { forgetWorker, listWorkers } from "#lib/server/workers/status.ts";
import { isUuid } from "#lib/shared/uuid.ts";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals }) => {
  requireAdminOrLogin(locals);
  return { workers: listWorkers(db) };
};

export const actions: Actions = {
  forget: async ({ locals, request }) => {
    requireAdminOrLogin(locals);
    const workerId = String((await request.formData()).get("workerId") ?? "");
    return runFormAction(() => {
      if (!isUuid(workerId)) throw badRequest("Choose a worker from the list.");
      forgetWorker(workerId);
    });
  },
};
