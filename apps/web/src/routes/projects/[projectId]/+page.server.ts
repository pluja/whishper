import type { MediaDerivativeKind } from "@anysub/contracts";
import { pool } from "$lib/server/db";
import {
  availableTranscriptionModels,
  detectedWorkerHardwareSummaries,
} from "$lib/server/adapters";
import { deleteProjectForUser } from "$lib/server/media";
import {
  cancelMediaPreparationForUser,
  deleteDerivativeForUser,
  isMediaDerivativeKind,
  requestMediaPreparationForUser,
} from "$lib/server/media-preparation";
import { deleteTranscriptForUser } from "$lib/server/transcripts";
import { error, fail, redirect, type Actions } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

type MediaPreparationStatus =
  "not_started" | "queued" | "running" | "completed" | "failed";

interface CueRow {
  id: string;
  position: number;
  start_us: number;
  end_us: number;
  text: string;
}

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.user) redirect(303, "/login");

  const project = await pool.query<{
    id: string;
    name: string;
    created_at: Date;
    workspace_name: string;
    media_filename: string | null;
    media_original_key: string | null;
    media_type: string | null;
    upload_status: string | null;
    size_bytes: number | null;
    media_duration_us: number | null;
    media_preparation_status: MediaPreparationStatus;
    media_probe: Record<string, unknown> | null;
    media_frame_rate_num: number | null;
    media_frame_rate_den: number | null;
    media_seekable: boolean | null;
    media_proxy_recommended: boolean | null;
    can_manage: boolean;
  }>(
    `select p.id, p.name, p.created_at, w.name as workspace_name,
            p.media_filename, p.media_original_key, upload.media_type,
            upload.status as upload_status, upload.size_bytes,
            p.media_duration_us, p.media_preparation_status, p.media_probe,
            p.media_frame_rate_num, p.media_frame_rate_den, p.media_seekable,
            p.media_proxy_recommended,
            (p.created_by = $2 or m.role in ('owner', 'admin')) as can_manage
       from projects p
       join workspaces w on w.id = p.workspace_id
       join memberships m on m.workspace_id = p.workspace_id
       left join media_uploads upload on upload.project_id = p.id
      where p.id = $1 and m.user_id = $2`,
    [params.projectId, locals.user.id],
  );
  if (!project.rows[0]) error(404, "Project not found");

  const run = await pool.query<{
    id: string;
    status: string;
    adapter_id: string;
    model_id: string;
    created_at: Date;
    job_state: string | null;
    progress: number | null;
    progress_message: string | null;
    error: Record<string, unknown> | null;
  }>(
    `select r.id, r.status, r.adapter_id, r.model_id, r.created_at,
            j.state as job_state, j.progress, j.progress_message, j.error
       from transcription_runs r
       left join lateral (
         select state, progress, progress_message, error
           from jobs
          where run_id = r.id
          order by created_at desc
          limit 1
       ) j on true
      where r.project_id = $1
      order by r.created_at desc
      limit 1`,
    [params.projectId],
  );

  const track = await pool.query<{
    id: string;
    name: string;
    language: string;
    metadata: Record<string, unknown>;
    revision: number;
  }>(
    `select id, name, language, metadata, revision
       from subtitle_tracks
      where project_id = $1
      order by created_at desc
      limit 1`,
    [params.projectId],
  );

  let cues: CueRow[] = [];
  if (track.rows[0]) {
    cues = (
      await pool.query<CueRow>(
        `select id, position, start_us, end_us, text
           from cues where track_id = $1 order by position asc`,
        [track.rows[0].id],
      )
    ).rows;
  }

  const preparation = await pool.query<{
    state: string;
    progress: number;
    progress_message: string | null;
    error: Record<string, unknown> | null;
  }>(
    `select state, progress, progress_message, error
       from jobs
      where payload->>'kind' = 'media_prepare'
        and payload->>'projectId' = $1
      order by created_at desc
      limit 1`,
    [params.projectId],
  );

  const derivatives = await pool.query<{
    kind: MediaDerivativeKind;
    media_type: string;
    size_bytes: number;
    metadata: Record<string, unknown>;
  }>(
    `select kind, media_type, size_bytes, metadata
       from media_derivatives
      where project_id = $1 and status = 'ready'
      order by kind`,
    [params.projectId],
  );

  const activeWorkers = await pool.query<{ manifest: unknown }>(
    `select manifest from workers where last_seen_at > now() - interval '15 seconds'`,
  );

  return {
    project: {
      ...project.rows[0],
      media_duration_us:
        project.rows[0].media_duration_us === null
          ? null
          : Number(project.rows[0].media_duration_us),
    },
    run: run.rows[0] ?? null,
    preparation: preparation.rows[0] ?? null,
    derivatives: derivatives.rows.map((derivative) => ({
      ...derivative,
      size_bytes: Number(derivative.size_bytes),
      url: `/api/projects/${params.projectId}/derivatives/${derivative.kind}`,
    })),
    track: track.rows[0]
      ? { ...track.rows[0], revision: Number(track.rows[0].revision) }
      : null,
    cues: cues.map((cue) => ({
      ...cue,
      start_us: Number(cue.start_us),
      end_us: Number(cue.end_us),
    })),
    transcriptionModels: availableTranscriptionModels(
      activeWorkers.rows.map((worker) => worker.manifest),
    ),
    detectedHardware: detectedWorkerHardwareSummaries(
      activeWorkers.rows.map((worker) => worker.manifest),
    ),
  };
};

export const actions: Actions = {
  transcribe: async ({ locals, params, request }) => {
    if (!locals.user) redirect(303, "/login");
    const values = await request.formData();
    const modelKey = String(values.get("model") ?? "");
    const languageValue = String(values.get("language") ?? "auto").trim();
    const alignment = values.get("alignment") === "on";
    const batchSizeValue = String(values.get("batchSize") ?? "").trim();
    const maxLineLengthValue = String(
      values.get("maxLineLength") ?? "42",
    ).trim();

    if (!modelKey.includes(":")) {
      return fail(400, { message: "Choose an available transcription model." });
    }
    if (
      languageValue !== "auto" &&
      !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(languageValue)
    ) {
      return fail(400, { message: "Choose a valid transcription language." });
    }
    const batchSize = batchSizeValue ? Number(batchSizeValue) : undefined;
    if (
      batchSize !== undefined &&
      (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 64)
    ) {
      return fail(400, { message: "Batch size must be between 1 and 64." });
    }
    const maxLineLength = Number(maxLineLengthValue);
    if (
      !Number.isInteger(maxLineLength) ||
      maxLineLength < 20 ||
      maxLineLength > 120
    ) {
      return fail(400, {
        message: "Maximum line length must be between 20 and 120 characters.",
      });
    }

    const separator = modelKey.indexOf(":");
    const adapterId = modelKey.slice(0, separator);
    const modelId = modelKey.slice(separator + 1);
    const client = await pool.connect();
    try {
      await client.query("begin");
      const project = await client.query<{
        id: string;
        workspace_id: string;
        media_original_key: string | null;
      }>(
        `select p.id, p.workspace_id, p.media_original_key
           from projects p
           join memberships m on m.workspace_id = p.workspace_id
          where p.id = $1 and m.user_id = $2
          for update of p`,
        [params.projectId, locals.user.id],
      );
      const ownedProject = project.rows[0];
      if (!ownedProject) error(404, "Project not found");
      if (!ownedProject.media_original_key) {
        await client.query("rollback");
        return fail(409, { message: "The source upload is not complete yet." });
      }

      const activeRun = await client.query(
        `select 1 from transcription_runs
          where project_id = $1 and status in ('queued', 'running') limit 1`,
        [ownedProject.id],
      );
      if (activeRun.rowCount) {
        await client.query("rollback");
        return fail(409, {
          message: "This project is already being transcribed.",
        });
      }

      const workers = await client.query<{ manifest: unknown }>(
        `select manifest from workers where last_seen_at > now() - interval '15 seconds'`,
      );
      const available = availableTranscriptionModels(
        workers.rows.map((worker) => worker.manifest),
      );
      if (
        !available.some(
          (model) => model.adapterId === adapterId && model.modelId === modelId,
        )
      ) {
        await client.query("rollback");
        return fail(409, {
          message: "That model is not available on a connected worker.",
        });
      }

      const options = {
        alignment,
        maxLineLength,
        ...(batchSize === undefined ? {} : { batchSize }),
      };
      const run = await client.query<{ id: string }>(
        `insert into transcription_runs
          (project_id, adapter_id, model_id, options, created_by)
         values ($1, $2, $3, $4, $5)
         returning id`,
        [
          ownedProject.id,
          adapterId,
          modelId,
          JSON.stringify(options),
          locals.user.id,
        ],
      );
      await client.query(
        `insert into jobs (workspace_id, run_id, kind, payload)
         values ($1, $2, 'transcribe', $3)`,
        [
          ownedProject.workspace_id,
          run.rows[0].id,
          JSON.stringify({
            kind: "transcribe",
            adapterId,
            modelId,
            projectId: ownedProject.id,
            runId: run.rows[0].id,
            mediaPath: `/data/${ownedProject.media_original_key}`,
            ...(languageValue === "auto" ? {} : { language: languageValue }),
            options,
          }),
        ],
      );
      await client.query("commit");
    } catch (cause) {
      await client.query("rollback");
      if (cause && typeof cause === "object" && "status" in cause) throw cause;
      console.error("Could not enqueue transcription", cause);
      return fail(500, { message: "The transcription could not be queued." });
    } finally {
      client.release();
    }
    redirect(303, `/projects/${params.projectId}`);
  },
  prepareMedia: async ({ locals, params }) => {
    if (!locals.user) redirect(303, "/login");
    const projectId = params.projectId;
    if (!projectId) error(400, "Project ID is required");
    try {
      if (!(await requestMediaPreparationForUser(projectId, locals.user.id))) {
        return fail(404, { message: "Project media was not found." });
      }
    } catch (cause) {
      console.error("Could not queue media preparation", cause);
      return fail(500, { message: "Media preparation could not be queued." });
    }
    redirect(303, `/projects/${projectId}`);
  },
  cancelMedia: async ({ locals, params }) => {
    if (!locals.user) redirect(303, "/login");
    const projectId = params.projectId;
    if (!projectId) error(400, "Project ID is required");
    try {
      if (!(await cancelMediaPreparationForUser(projectId, locals.user.id))) {
        return fail(409, { message: "Media preparation is no longer active." });
      }
    } catch (cause) {
      console.error("Could not cancel media preparation", cause);
      return fail(500, {
        message: "Media preparation could not be cancelled.",
      });
    }
    redirect(303, `/projects/${projectId}`);
  },
  deleteDerivative: async ({ locals, params, request }) => {
    if (!locals.user) redirect(303, "/login");
    const projectId = params.projectId;
    if (!projectId) error(400, "Project ID is required");
    const kind = String((await request.formData()).get("kind") ?? "");
    if (!isMediaDerivativeKind(kind)) {
      return fail(400, { message: "The derivative type is invalid." });
    }
    try {
      if (!(await deleteDerivativeForUser(projectId, kind, locals.user.id))) {
        return fail(404, { message: "The derivative was not found." });
      }
    } catch (cause) {
      console.error("Could not delete derivative", cause);
      return fail(500, { message: "The derivative could not be deleted." });
    }
    redirect(303, `/projects/${projectId}`);
  },
  deleteTranscript: async ({ locals, params, request }) => {
    if (!locals.user) redirect(303, "/login");
    const projectId = params.projectId;
    if (!projectId) error(400, "Project ID is required");
    const trackId = String((await request.formData()).get("trackId") ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(trackId)) {
      return fail(400, { message: "The subtitle track is invalid." });
    }
    try {
      if (
        !(await deleteTranscriptForUser(projectId, trackId, locals.user.id))
      ) {
        return fail(404, {
          message: "The transcript was not found or cannot be deleted.",
        });
      }
    } catch (cause) {
      console.error("Could not delete transcript", cause);
      return fail(500, { message: "The transcript could not be deleted." });
    }
    redirect(303, `/projects/${projectId}`);
  },
  deleteProject: async ({ locals, params }) => {
    if (!locals.user) redirect(303, "/login");
    const projectId = params.projectId;
    if (!projectId) error(400, "Project ID is required");
    try {
      if (!(await deleteProjectForUser(projectId, locals.user.id))) {
        return fail(404, {
          message: "The project was not found or cannot be deleted.",
        });
      }
    } catch (cause) {
      console.error("Could not delete project", cause);
      return fail(500, { message: "The project could not be deleted." });
    }
    redirect(303, "/");
  },
};
