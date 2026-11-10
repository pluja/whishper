import type {
  JobCompletion,
  TranscriptArtifact,
  TranscriptionJobCompletion,
  TranscriptionJobPayload,
  WorkerJobPayload,
} from "@anysub/contracts";
import { and, eq } from "drizzle-orm";

import { db, type Executor } from "$lib/server/db";
import { jobs, subtitleTracks, transcriptionRuns } from "$lib/server/db/schema";
import { withTransaction } from "$lib/server/db/transaction";
import { unprocessable } from "$lib/server/http/errors";
import { holdsActiveLease } from "$lib/server/jobs/predicates";
import { RELEASED_LEASE } from "$lib/server/jobs/release";
import {
  commitMediaFinalization,
  linkMediaArtifacts,
  recordMediaFinalization,
  rollbackMediaFinalization,
} from "$lib/server/media/finalize";
import { withKeyedLock } from "$lib/server/storage/keyed-lock";
import { insertCues } from "$lib/server/subtitles/cues";

type CompletionOutcome = "completed" | "already-completed" | "lease-rejected";

type LeasedJob = {
  runId: string | null;
  workspaceId: string | null;
  attempts: number;
  payload: WorkerJobPayload;
};

// The lock keeps a retried completion from linking files while the first one
// is still recording them.
export async function completeJob(
  jobId: string,
  leaseToken: string,
  completion: JobCompletion,
): Promise<CompletionOutcome> {
  return withKeyedLock(`job:${jobId}`, async () => {
    const job = leasedJob(db, jobId, leaseToken);
    if (typeof job === "string") return job;

    if (job.payload.kind === "transcribe") {
      if (completion.kind !== "transcribe") throw completionKindMismatch();
      assertTranscriptTiming(completion.artifact);
      const payload = job.payload;
      return withTransaction((tx) => {
        const current = leasedJob(tx, jobId, leaseToken);
        if (typeof current === "string") return current;
        storeTranscript(tx, current.runId, payload, completion);
        markCompleted(tx, jobId, current.runId, completion);
        return "completed";
      });
    }

    if (job.payload.kind === "model_cache") {
      if (
        completion.kind !== "model_cache" ||
        completion.action !== job.payload.action
      ) {
        throw completionKindMismatch();
      }
      return withTransaction((tx) => {
        const current = leasedJob(tx, jobId, leaseToken);
        if (typeof current === "string") return current;
        markCompleted(tx, jobId, null, completion);
        return "completed";
      });
    }

    if (completion.kind !== "media_prepare" || !job.workspaceId) {
      throw completionKindMismatch();
    }
    const input = {
      jobId,
      attempt: job.attempts,
      workspaceId: job.workspaceId,
      payload: job.payload,
      completion,
    };
    const plan = await linkMediaArtifacts(input);
    let recorded: { outcome: CompletionOutcome; obsoletePaths: string[] };
    try {
      recorded = withTransaction((tx) => {
        const current = leasedJob(tx, jobId, leaseToken);
        if (typeof current === "string") {
          return { outcome: current, obsoletePaths: [] };
        }
        const obsoletePaths = recordMediaFinalization(tx, input, plan);
        markCompleted(tx, jobId, current.runId, completion);
        return { outcome: "completed" as const, obsoletePaths };
      });
    } catch (cause) {
      await rollbackMediaFinalization(plan);
      throw cause;
    }
    if (recorded.outcome !== "completed") {
      await rollbackMediaFinalization(plan);
      return recorded.outcome;
    }
    await commitMediaFinalization(plan, recorded.obsoletePaths).catch((cause) =>
      console.warn(`Could not finalize media for job ${jobId}`, cause),
    );
    return "completed";
  });
}

function leasedJob(
  executor: Executor,
  jobId: string,
  leaseToken: string,
): LeasedJob | Exclude<CompletionOutcome, "completed"> {
  const job = executor
    .select({
      runId: jobs.runId,
      workspaceId: jobs.workspaceId,
      attempts: jobs.attempts,
      payload: jobs.payload,
    })
    .from(jobs)
    .where(and(eq(jobs.id, jobId), holdsActiveLease(leaseToken)))
    .get();
  if (job) return job;
  const state = executor
    .select({ state: jobs.state })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .get()?.state;
  return state === "completed" ? "already-completed" : "lease-rejected";
}

function markCompleted(
  tx: Executor,
  jobId: string,
  runId: string | null,
  completion: JobCompletion,
): void {
  const now = new Date();
  tx.update(jobs)
    .set({
      state: "completed",
      result: completion,
      progress: 1,
      progressMessage: "Completed",
      completedAt: now,
      ...RELEASED_LEASE,
    })
    .where(eq(jobs.id, jobId))
    .run();
  if (runId) {
    tx.update(transcriptionRuns)
      .set({ status: "completed", completedAt: now })
      .where(eq(transcriptionRuns.id, runId))
      .run();
  }
}

function storeTranscript(
  tx: Executor,
  runId: string | null,
  payload: TranscriptionJobPayload,
  completion: TranscriptionJobCompletion,
): void {
  const { artifact } = completion;
  const track = tx
    .insert(subtitleTracks)
    .values({
      projectId: payload.projectId,
      sourceRunId: runId,
      name: `${completion.adapter.id} · ${completion.adapter.modelId}`,
      language: artifact.language,
      kind: "transcription",
      metadata: {
        adapter: completion.adapter,
        schemaVersion: artifact.schemaVersion,
        durationUs: artifact.durationUs,
        ...artifact.metadata,
      },
    })
    .returning({ id: subtitleTracks.id })
    .get();
  insertCues(tx, track.id, { ids: "generate", cues: artifact.cues });
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
