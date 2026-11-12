import type { WorkerDevice } from "@anysub/contracts";
import { fail } from "@sveltejs/kit";

import { requireAdminOrLogin } from "#lib/server/auth/session.ts";
import { db } from "#lib/server/db/index.ts";
import {
  parseTranscriptionDefaults,
  readTranscriptionDefaults,
  updateInstanceSettings,
} from "#lib/server/settings/instance.ts";
import { transcriptionModelChoices } from "#lib/server/transcription/models.ts";
import { activeWorkerManifests } from "#lib/server/workers/presence.ts";
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
    models: transcriptionModelChoices(db, manifests, defaults.precision),
    devices: [...devices],
  };
};

export const actions: Actions = {
  save: async ({ locals, request }) => {
    requireAdminOrLogin(locals);
    const parsed = parseTranscriptionDefaults(await request.formData());
    if ("problem" in parsed) return fail(400, { problem: parsed.problem });
    updateInstanceSettings(parsed.value);
    return { saved: true };
  },
};
