import { requireUserOrLogin } from "#lib/server/auth/session.ts";
import { db } from "#lib/server/db/index.ts";
import { runFormAction } from "#lib/server/http/actions.ts";
import {
  deleteDerivativeForUser,
  isMediaDerivativeKind,
} from "#lib/server/media/derivatives.ts";
import {
  cancelMediaPreparationForUser,
  requestMediaPreparationForUser,
} from "#lib/server/media/preparation.ts";
import { projectForUser } from "#lib/server/projects/access.ts";
import { deleteProjectForUser } from "#lib/server/projects/delete.ts";
import {
  latestMediaPreparation,
  latestRun,
  readyDerivatives,
  studioProject,
} from "#lib/server/projects/studio.ts";
import { readTranscriptionDefaults } from "#lib/server/settings/instance.ts";
import { listTrackCues } from "#lib/server/subtitles/cues.ts";
import { latestTrackForProject } from "#lib/server/subtitles/tracks.ts";
import { deleteTranscriptForUser } from "#lib/server/subtitles/transcripts.ts";
import { cancelTranscriptionForUser } from "#lib/server/transcription/cancel.ts";
import {
  enqueueTranscription,
  parseTranscriptionRequest,
} from "#lib/server/transcription/enqueue.ts";
import {
  detectedWorkerHardware,
  transcriptionModelChoices,
} from "#lib/server/transcription/models.ts";
import { activeWorkerManifests } from "#lib/server/workers/presence.ts";
import { projectDerivativeUrl, projectPageUrl } from "#lib/shared/routes.ts";
import type { StudioData } from "#lib/shared/studio-data.ts";
import { isUuid } from "#lib/shared/uuid.ts";
import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({
  locals,
  params,
}): Promise<StudioData> => {
  const user = requireUserOrLogin(locals);
  const access = projectForUser(db, params.projectId, user.id);
  const project = access && studioProject(db, access.id);
  if (!access || !project) error(404, "Project not found");

  const run = latestRun(db, project.id);
  const preparation = latestMediaPreparation(db, project.id);
  const derivatives = readyDerivatives(db, project.id);
  const track = latestTrackForProject(db, project.id);
  const workerManifests = activeWorkerManifests(db);
  const transcriptionDefaults = readTranscriptionDefaults(db);
  const cues = track ? listTrackCues(db, track.id) : [];

  return {
    project: { ...project, canManage: access.canManage },
    run,
    preparation,
    derivatives: derivatives.map((derivative) => ({
      ...derivative,
      url: projectDerivativeUrl(project.id, derivative.kind),
    })),
    track,
    cues,
    transcriptionModels: transcriptionModelChoices(
      db,
      workerManifests,
      transcriptionDefaults.precision,
    ),
    detectedHardware: detectedWorkerHardware(workerManifests),
    transcriptionDefaults,
  };
};

export const actions: Actions = {
  transcribe: async ({ locals, params, request }) => {
    const user = requireUserOrLogin(locals);
    const values = await request.formData();
    return runFormAction(async () => {
      enqueueTranscription(
        params.projectId,
        user.id,
        parseTranscriptionRequest(values),
      );
      redirect(303, projectPageUrl(params.projectId));
    }, "The transcription could not be queued.");
  },
  cancelTranscription: async ({ locals, params }) => {
    const user = requireUserOrLogin(locals);
    return runFormAction(async () => {
      if (!cancelTranscriptionForUser(params.projectId, user.id)) {
        return fail(409, {
          message: "The transcription is no longer active.",
        });
      }
      redirect(303, projectPageUrl(params.projectId));
    }, "The transcription could not be cancelled.");
  },
  prepareMedia: async ({ locals, params }) => {
    const user = requireUserOrLogin(locals);
    return runFormAction(async () => {
      if (!requestMediaPreparationForUser(params.projectId, user.id)) {
        return fail(404, { message: "Project media was not found." });
      }
      redirect(303, projectPageUrl(params.projectId));
    }, "Media preparation could not be queued.");
  },
  cancelMedia: async ({ locals, params }) => {
    const user = requireUserOrLogin(locals);
    return runFormAction(async () => {
      if (!(await cancelMediaPreparationForUser(params.projectId, user.id))) {
        return fail(409, {
          message: "Media preparation is no longer active.",
        });
      }
      redirect(303, projectPageUrl(params.projectId));
    }, "Media preparation could not be cancelled.");
  },
  deleteDerivative: async ({ locals, params, request }) => {
    const user = requireUserOrLogin(locals);
    const kind = String((await request.formData()).get("kind") ?? "");
    if (!isMediaDerivativeKind(kind)) {
      return fail(400, { message: "The derivative type is invalid." });
    }
    return runFormAction(async () => {
      if (!(await deleteDerivativeForUser(params.projectId, kind, user.id))) {
        return fail(404, { message: "The derivative was not found." });
      }
      redirect(303, projectPageUrl(params.projectId));
    }, "The derivative could not be deleted.");
  },
  deleteTranscript: async ({ locals, params, request }) => {
    const user = requireUserOrLogin(locals);
    const trackId = String((await request.formData()).get("trackId") ?? "");
    if (!isUuid(trackId)) {
      return fail(400, { message: "The subtitle track is invalid." });
    }
    return runFormAction(async () => {
      if (!deleteTranscriptForUser(params.projectId, trackId, user.id)) {
        return fail(404, {
          message: "The transcript was not found or cannot be deleted.",
        });
      }
      redirect(303, projectPageUrl(params.projectId));
    }, "The transcript could not be deleted.");
  },
  deleteProject: async ({ locals, params }) => {
    const user = requireUserOrLogin(locals);
    return runFormAction(async () => {
      if (!(await deleteProjectForUser(params.projectId, user.id))) {
        return fail(404, {
          message: "The project was not found or cannot be deleted.",
        });
      }
      redirect(303, "/");
    }, "The project could not be deleted.");
  },
};
