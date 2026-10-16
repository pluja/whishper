import type { MediaDerivativeKind } from "@anysub/contracts";
import type { PoolClient } from "pg";

import { IS_MEDIA_PREPARE_JOB } from "$lib/server/jobs/predicates";

type Queryable = Pick<PoolClient, "query">;

export type MediaPreparationStatus =
  "not_started" | "queued" | "running" | "completed" | "failed";

export type StudioProject = {
  id: string;
  name: string;
  createdAt: Date;
  workspaceName: string;
  mediaFilename: string | null;
  mediaOriginalKey: string | null;
  mediaType: string | null;
  uploadStatus: string | null;
  sizeBytes: number | null;
  mediaDurationUs: number | null;
  mediaPreparationStatus: MediaPreparationStatus;
  mediaProbe: Record<string, unknown> | null;
  mediaFrameRateNum: number | null;
  mediaFrameRateDen: number | null;
  mediaSeekable: boolean | null;
  mediaProxyRecommended: boolean | null;
};

type JobProgress = {
  progress: number | null;
  progressMessage: string | null;
  error: Record<string, unknown> | null;
};

export type StudioRun = JobProgress & {
  id: string;
  status: string;
  adapterId: string;
  modelId: string;
  createdAt: Date;
  jobState: string | null;
};

export type StudioPreparation = JobProgress & { state: string };

export type StudioDerivative = {
  kind: MediaDerivativeKind;
  mediaType: string;
  sizeBytes: number;
  metadata: Record<string, unknown>;
};

export async function studioProject(
  executor: Queryable,
  projectId: string,
): Promise<StudioProject | null> {
  const result = await executor.query<StudioProject>(
    `select p.id, p.name, p.created_at as "createdAt",
            w.name as "workspaceName",
            p.media_filename as "mediaFilename",
            p.media_original_key as "mediaOriginalKey",
            upload.media_type as "mediaType",
            upload.status as "uploadStatus",
            upload.size_bytes as "sizeBytes",
            p.media_duration_us as "mediaDurationUs",
            p.media_preparation_status as "mediaPreparationStatus",
            p.media_probe as "mediaProbe",
            p.media_frame_rate_num as "mediaFrameRateNum",
            p.media_frame_rate_den as "mediaFrameRateDen",
            p.media_seekable as "mediaSeekable",
            p.media_proxy_recommended as "mediaProxyRecommended"
       from projects p
       join workspaces w on w.id = p.workspace_id
       left join media_uploads upload on upload.project_id = p.id
      where p.id = $1`,
    [projectId],
  );
  return result.rows[0] ?? null;
}

export async function latestRun(
  executor: Queryable,
  projectId: string,
): Promise<StudioRun | null> {
  const result = await executor.query<StudioRun>(
    `select r.id, r.status, r.adapter_id as "adapterId",
            r.model_id as "modelId", r.created_at as "createdAt",
            j.state as "jobState", j.progress,
            j.progress_message as "progressMessage", j.error
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
    [projectId],
  );
  return result.rows[0] ?? null;
}

export async function latestMediaPreparation(
  executor: Queryable,
  projectId: string,
): Promise<StudioPreparation | null> {
  const result = await executor.query<StudioPreparation>(
    `select state, progress, progress_message as "progressMessage", error
       from jobs
      where project_id = $1 and ${IS_MEDIA_PREPARE_JOB}
      order by created_at desc
      limit 1`,
    [projectId],
  );
  return result.rows[0] ?? null;
}

export async function readyDerivatives(
  executor: Queryable,
  projectId: string,
): Promise<StudioDerivative[]> {
  const result = await executor.query<StudioDerivative>(
    `select kind, media_type as "mediaType", size_bytes as "sizeBytes",
            metadata
       from media_derivatives
      where project_id = $1 and status = 'ready'
      order by kind`,
    [projectId],
  );
  return result.rows;
}
