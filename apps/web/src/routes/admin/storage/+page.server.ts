import { fail } from "@sveltejs/kit";

import { requireAdminOrLogin } from "$lib/server/auth/session";
import { db } from "$lib/server/db";
import {
  parseUploadLimit,
  readInstanceSettings,
  updateInstanceSettings,
} from "$lib/server/settings/instance";
import { storageUsage } from "$lib/server/storage/usage";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  requireAdminOrLogin(locals);
  return {
    usage: await storageUsage(db),
    maxUploadBytes: readInstanceSettings(db).maxUploadBytes,
  };
};

export const actions: Actions = {
  saveUploadLimit: async ({ locals, request }) => {
    requireAdminOrLogin(locals);
    const parsed = parseUploadLimit(await request.formData());
    if ("problem" in parsed) return fail(400, { problem: parsed.problem });
    updateInstanceSettings({ maxUploadBytes: parsed.value });
    return { saved: true };
  },
};
