import {
  MEDIA_PREPARATION_VERSION,
  MODEL_CACHE_VERSION,
  type WorkerLease,
  type WorkerManifest,
} from "@anysub/contracts";
import { and, asc, desc, eq, inArray, lte, or } from "drizzle-orm";

import {
  jobs,
  projects,
  transcriptionRuns,
  workers,
} from "#lib/server/db/schema.ts";
import { withTransaction } from "#lib/server/db/transaction.ts";
import {
  cleanupReclaimedArtifacts,
  reclaimExpiredLeases,
} from "#lib/server/jobs/failure.ts";
import { generateLeaseToken, hashToken } from "#lib/server/jobs/lease-token.ts";
import {
  holdsActiveLease,
  isMediaPrepareJob,
  isModelCacheJobOf,
  payloadField,
} from "#lib/server/jobs/predicates.ts";
import { recordWorkerPresence } from "#lib/server/workers/presence.ts";

const LEASE_MS = 60_000;
export const WORKER_POLL_INTERVAL_MS = 2_000;

export async function leaseJob(
  manifest: WorkerManifest,
): Promise<WorkerLease | null> {
  const adapterIds = manifest.adapters.map((adapter) => adapter.id);
  const supportsMediaPreparation =
    manifest.capabilities.mediaPreparation === MEDIA_PREPARATION_VERSION;
  const supportsModelCache =
    manifest.capabilities.modelCache === MODEL_CACHE_VERSION &&
    adapterIds.length > 0;
  const { lease, reclaimed } = withTransaction((tx) => {
    recordWorkerPresence(tx, manifest);
    const reclaimed = reclaimExpiredLeases(tx);

    const offeredAdapter = inArray(payloadField("adapterId"), adapterIds);
    const compatible = [
      ...(adapterIds.length > 0
        ? [and(eq(jobs.kind, "transcribe"), offeredAdapter)]
        : []),
      ...(supportsMediaPreparation ? [isMediaPrepareJob] : []),
      ...(supportsModelCache
        ? [and(isModelCacheJobOf(manifest.workerId), offeredAdapter)]
        : []),
    ];
    if (compatible.length === 0) return { lease: null, reclaimed };

    const now = new Date();
    const job = tx
      .select({ id: jobs.id, attempts: jobs.attempts, payload: jobs.payload })
      .from(jobs)
      .where(
        and(
          eq(jobs.state, "queued"),
          lte(jobs.availableAt, now),
          or(...compatible),
        ),
      )
      .orderBy(desc(jobs.priority), asc(jobs.createdAt))
      .limit(1)
      .get();
    if (!job) return { lease: null, reclaimed };

    const leaseToken = generateLeaseToken();
    const leaseExpiresAt = new Date(now.getTime() + LEASE_MS);
    tx.update(jobs)
      .set({
        state: "leased",
        leasedBy: manifest.workerId,
        leaseTokenHash: hashToken(leaseToken),
        leaseExpiresAt,
        attempts: job.attempts + 1,
      })
      .where(eq(jobs.id, job.id))
      .run();
    if (job.payload.kind === "transcribe") {
      tx.update(transcriptionRuns)
        .set({ status: "running" })
        .where(
          and(
            eq(transcriptionRuns.id, job.payload.runId),
            eq(transcriptionRuns.status, "queued"),
          ),
        )
        .run();
    } else if (job.payload.kind === "media_prepare") {
      tx.update(projects)
        .set({ mediaPreparationStatus: "running" })
        .where(eq(projects.id, job.payload.projectId))
        .run();
    }

    return {
      lease: {
        jobId: job.id,
        attempt: job.attempts + 1,
        leaseToken,
        leaseExpiresAt: leaseExpiresAt.toISOString(),
        payload: job.payload,
      },
      reclaimed,
    };
  });
  await cleanupReclaimedArtifacts(reclaimed);
  return lease;
}

export function reportProgress(
  jobId: string,
  leaseToken: string,
  progress: number,
  message: string,
): boolean {
  return withTransaction((tx) => {
    const now = new Date();
    const job = tx
      .update(jobs)
      .set({
        progress,
        progressMessage: message,
        leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
      })
      .where(and(eq(jobs.id, jobId), holdsActiveLease(leaseToken, now)))
      .returning({ leasedBy: jobs.leasedBy })
      .get();
    if (!job) return false;
    if (job.leasedBy) {
      tx.update(workers)
        .set({ lastSeenAt: now })
        .where(eq(workers.id, job.leasedBy))
        .run();
    }
    return true;
  });
}
