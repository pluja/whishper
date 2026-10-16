import type {
  JobCompletion,
  TranscriptArtifact,
  TranscriptionJobCompletion,
  WorkerJobPayload,
} from "@anysub/contracts";
import type { PoolClient } from "pg";

import { withTransaction } from "$lib/server/db/transaction";
import { unprocessable } from "$lib/server/http/errors";
import { hashToken } from "$lib/server/jobs/lease-token";
import {
  commitMediaFinalization,
  finalizeMediaPreparation,
  rollbackMediaFinalization,
  type MediaFinalizationPlan,
} from "$lib/server/media/finalize";
import { insertCues } from "$lib/server/subtitles/cues";

export async function completeJob(
  jobId: string,
  leaseToken: string,
  completion: JobCompletion,
): Promise<"completed" | "already-completed" | "lease-rejected"> {
  let mediaFinalization: MediaFinalizationPlan | undefined;
  try {
    const outcome = await withTransaction(async (client) => {
      const locked = await client.query<{
        state: string;
        run_id: string | null;
        workspace_id: string;
        attempts: number;
        payload: WorkerJobPayload;
        lease_accepted: boolean;
      }>(
        `select state, run_id, workspace_id, attempts, payload,
                (state = 'leased' and lease_token_hash = $2
                 and lease_expires_at > now()) as lease_accepted
         from jobs where id = $1 for update`,
        [jobId, hashToken(leaseToken)],
      );
      const job = locked.rows[0];
      if (!job) return "lease-rejected";
      if (job.state === "completed") return "already-completed";
      if (!job.lease_accepted) return "lease-rejected";

      if (job.payload.kind === "transcribe") {
        if (completion.kind !== "transcribe") throw completionKindMismatch();
        await storeTranscriptCompletion(
          client,
          { run_id: job.run_id, payload: job.payload },
          completion,
        );
      } else {
        if (completion.kind !== "media_prepare") throw completionKindMismatch();
        mediaFinalization = await finalizeMediaPreparation(client, {
          jobId,
          attempt: job.attempts,
          workspaceId: job.workspace_id,
          payload: job.payload,
          completion,
        });
      }

      await client.query(
        `update jobs
          set state = 'completed', result = $2, progress = 1,
              progress_message = 'Completed', completed_at = now(), updated_at = now(),
              lease_token_hash = null, lease_expires_at = null
        where id = $1`,
        [jobId, JSON.stringify(completion)],
      );
      if (job.run_id) {
        await client.query(
          `update transcription_runs set status = 'completed', completed_at = now() where id = $1`,
          [job.run_id],
        );
      }
      return "completed";
    });
    if (outcome === "completed" && mediaFinalization) {
      await commitMediaFinalization(mediaFinalization).catch((cause) => {
        console.warn(`Could not finalize media for job ${jobId}`, cause);
      });
    }
    return outcome;
  } catch (cause) {
    if (mediaFinalization) await rollbackMediaFinalization(mediaFinalization);
    throw cause;
  }
}

async function storeTranscriptCompletion(
  client: PoolClient,
  job: {
    run_id: string | null;
    payload: Extract<WorkerJobPayload, { kind: "transcribe" }>;
  },
  completion: TranscriptionJobCompletion,
): Promise<void> {
  const { artifact } = completion;
  assertTranscriptTiming(artifact);
  const track = await client.query<{ id: string }>(
    `insert into subtitle_tracks
      (project_id, source_run_id, name, language, kind, metadata)
     values ($1, $2, $3, $4, 'transcription', $5)
     returning id`,
    [
      job.payload.projectId,
      job.run_id,
      `${completion.adapter.id} · ${completion.adapter.modelId}`,
      artifact.language,
      JSON.stringify({
        adapter: completion.adapter,
        schemaVersion: artifact.schemaVersion,
        durationUs: artifact.durationUs,
        ...artifact.metadata,
      }),
    ],
  );

  await insertCues(client, track.rows[0].id, {
    ids: "generate",
    cues: artifact.cues,
  });
}

function completionKindMismatch(): Error {
  return unprocessable("Worker completion does not match the leased job.");
}

function assertTranscriptTiming(artifact: TranscriptArtifact): void {
  let previousStart = -1;
  for (const cue of artifact.cues) {
    if (cue.endUs < cue.startUs || cue.endUs > artifact.durationUs) {
      throw unprocessable("Adapter returned invalid cue timing.");
    }
    if (cue.startUs < previousStart) {
      throw unprocessable("Adapter cues are not ordered.");
    }
    previousStart = cue.startUs;
  }
}
