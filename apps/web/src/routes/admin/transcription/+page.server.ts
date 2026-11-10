import type { WorkerDevice } from "@anysub/contracts";
import { fail } from "@sveltejs/kit";

import { requireAdminOrLogin } from "$lib/server/auth/session";
import { db } from "$lib/server/db";
import {
  parseTranscriptionDefaults,
  readTranscriptionDefaults,
  updateInstanceSettings,
} from "$lib/server/settings/instance";
import { availableTranscriptionModels } from "$lib/server/transcription/models";
import { activeWorkerManifests } from "$lib/server/workers/presence";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals }) => {
  requireAdminOrLogin(locals);
  const manifests = activeWorkerManifests(db);
  const devices = new Set<WorkerDevice>();
  for (const manifest of manifests) {
    if (manifest.hardware) devices.add(manifest.hardware.device);
  }
  const defaults = readTranscriptionDefaults(db);
  return {
    defaults,
    models: availableTranscriptionModels(manifests, defaults.precision),
    devices: [...devices],
  };
};

export const actions: Actions = {
  save: async ({ locals, request }) => {
    requireAdminOrLogin(locals);
    const parsed = parseTranscriptionDefaults(await request.formData());
    if ("problem" in parsed) return fail(400, parsed.problem);
    updateInstanceSettings(parsed.value);
    return { saved: true };
  },
};
