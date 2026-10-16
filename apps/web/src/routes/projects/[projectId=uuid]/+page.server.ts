import { requireUserOrLogin } from "$lib/server/auth/session";
import { pool } from "$lib/server/db";
import { clientFailure } from "$lib/server/http/errors";
import { isMediaDerivativeKind } from "$lib/server/media/derivatives";
import { deleteDerivativeForUser } from "$lib/server/media/finalize";
import {
  cancelMediaPreparationForUser,
  requestMediaPreparationForUser,
} from "$lib/server/media/preparation";
import { projectForUser } from "$lib/server/projects/access";
import { deleteProjectForUser } from "$lib/server/projects/delete";
import {
  latestMediaPreparation,
  latestRun,
  readyDerivatives,
  studioProject,
} from "$lib/server/projects/queries";
import { listTrackCues } from "$lib/server/subtitles/cues";
import { latestTrackForProject } from "$lib/server/subtitles/tracks";
import { deleteTranscriptForUser } from "$lib/server/subtitles/transcripts";
import {
  enqueueTranscription,
  parseTranscriptionRequest,
} from "$lib/server/transcription/enqueue";
import {
  availableTranscriptionModels,
  detectedWorkerHardware,
} from "$lib/server/transcription/models";
import { activeWorkerManifests } from "$lib/server/workers/active";
import { isUuid } from "$lib/shared/uuid";
import {
  error,
  fail,
  isHttpError,
  isRedirect,
  redirect,
  type ActionFailure,
} from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

type ActionMessage = { message: string };

// Known client failures become inline form messages. Anything else is logged
// and replaced by failureMessage so internals never reach the page.
async function runAction(
  label: string,
  failureMessage: string,
  work: () => Promise<ActionFailure<ActionMessage>>,
): Promise<ActionFailure<ActionMessage>> {
  try {
    return await work();
  } catch (cause) {
    if (isHttpError(cause) || isRedirect(cause)) throw cause;
    const failure = clientFailure(cause);
    if (failure) return fail(failure.status, { message: failure.message });
    console.error(`Could not ${label}`, cause);
    return fail(500, { message: failureMessage });
  }
}

export const load: PageServerLoad = async ({ locals, params }) => {
  const user = requireUserOrLogin(locals);
  const access = await projectForUser(pool, params.projectId, user.id);
  const project = access && (await studioProject(pool, access.id));
  if (!access || !project) error(404, "Project not found");

  const [run, preparation, derivatives, track, workerManifests] =
    await Promise.all([
      latestRun(pool, project.id),
      latestMediaPreparation(pool, project.id),
      readyDerivatives(pool, project.id),
      latestTrackForProject(pool, project.id),
      activeWorkerManifests(pool),
    ]);
  const cues = track ? await listTrackCues(pool, track.id) : [];

  return {
    project: { ...project, canManage: access.canManage },
    run,
    preparation,
    derivatives: derivatives.map((derivative) => ({
      ...derivative,
      url: `/api/projects/${project.id}/derivatives/${derivative.kind}`,
    })),
    track,
    cues,
    transcriptionModels: availableTranscriptionModels(workerManifests),
    detectedHardware: detectedWorkerHardware(workerManifests),
  };
};

export const actions: Actions = {
  transcribe: async ({ locals, params, request }) => {
    const user = requireUserOrLogin(locals);
    const values = await request.formData();
    return runAction(
      "enqueue transcription",
      "The transcription could not be queued.",
      async () => {
        await enqueueTranscription(
          params.projectId,
          user.id,
          parseTranscriptionRequest(values),
        );
        redirect(303, `/projects/${params.projectId}`);
      },
    );
  },
  prepareMedia: async ({ locals, params }) => {
    const user = requireUserOrLogin(locals);
    return runAction(
      "queue media preparation",
      "Media preparation could not be queued.",
      async () => {
        if (
          !(await requestMediaPreparationForUser(params.projectId, user.id))
        ) {
          return fail(404, { message: "Project media was not found." });
        }
        redirect(303, `/projects/${params.projectId}`);
      },
    );
  },
  cancelMedia: async ({ locals, params }) => {
    const user = requireUserOrLogin(locals);
    return runAction(
      "cancel media preparation",
      "Media preparation could not be cancelled.",
      async () => {
        if (!(await cancelMediaPreparationForUser(params.projectId, user.id))) {
          return fail(409, {
            message: "Media preparation is no longer active.",
          });
        }
        redirect(303, `/projects/${params.projectId}`);
      },
    );
  },
  deleteDerivative: async ({ locals, params, request }) => {
    const user = requireUserOrLogin(locals);
    const kind = String((await request.formData()).get("kind") ?? "");
    if (!isMediaDerivativeKind(kind)) {
      return fail(400, { message: "The derivative type is invalid." });
    }
    return runAction(
      "delete derivative",
      "The derivative could not be deleted.",
      async () => {
        if (!(await deleteDerivativeForUser(params.projectId, kind, user.id))) {
          return fail(404, { message: "The derivative was not found." });
        }
        redirect(303, `/projects/${params.projectId}`);
      },
    );
  },
  deleteTranscript: async ({ locals, params, request }) => {
    const user = requireUserOrLogin(locals);
    const trackId = String((await request.formData()).get("trackId") ?? "");
    if (!isUuid(trackId)) {
      return fail(400, { message: "The subtitle track is invalid." });
    }
    return runAction(
      "delete transcript",
      "The transcript could not be deleted.",
      async () => {
        if (
          !(await deleteTranscriptForUser(params.projectId, trackId, user.id))
        ) {
          return fail(404, {
            message: "The transcript was not found or cannot be deleted.",
          });
        }
        redirect(303, `/projects/${params.projectId}`);
      },
    );
  },
  deleteProject: async ({ locals, params }) => {
    const user = requireUserOrLogin(locals);
    return runAction(
      "delete project",
      "The project could not be deleted.",
      async () => {
        if (!(await deleteProjectForUser(params.projectId, user.id))) {
          return fail(404, {
            message: "The project was not found or cannot be deleted.",
          });
        }
        redirect(303, "/");
      },
    );
  },
};
