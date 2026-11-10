import { stat } from "node:fs/promises";

import { and, eq, inArray, ne } from "drizzle-orm";

import { db } from "$lib/server/db";
import { mediaUploads } from "$lib/server/db/schema";
import { stagedUploadPath } from "$lib/server/storage/paths";
import { deleteUnfinishedUploadProject } from "$lib/server/uploads/projects";

export const UPLOAD_EXPIRATION_MS = 7 * 24 * 60 * 60 * 1_000;
const SWEEP_INTERVAL_MS = 15 * 60 * 1_000;
export const IDLE_BEFORE_RETRY_MS = 10 * 60 * 1_000;
const FINALIZE_RETRY_WINDOW_MS = 24 * 60 * 60 * 1_000;

export type SweepCandidate = {
  id: string;
  projectId: string;
  createdBy: string;
  status: "uploading" | "finalizing" | "failed";
  sizeBytes: number;
  firstFinalizeAttemptAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type UploadAction = "keep" | "finalize" | "fail" | "expire";

export type UploadMaintenanceOptions = {
  finalizeUpload: (uploadId: string, userId: string) => Promise<void>;
  removeTusUpload: (uploadId: string) => Promise<void>;
  deleteExpiredTusFiles: () => Promise<void>;
};

export type SweepPorts = {
  listCandidates: () => Promise<SweepCandidate[]>;
  stagedBytes: (uploadId: string) => Promise<number | null>;
  finalize: (candidate: SweepCandidate) => Promise<void>;
  markFailed: (uploadId: string, reason: string) => Promise<void>;
  deleteUpload: (candidate: SweepCandidate) => Promise<void>;
  deleteExpiredTusFiles: () => Promise<void>;
};

export function decideUploadAction(
  candidate: SweepCandidate,
  stagedBytes: number | null,
  now: Date,
): UploadAction {
  if (now.getTime() - candidate.createdAt.getTime() > UPLOAD_EXPIRATION_MS) {
    return "expire";
  }
  if (candidate.status === "failed") return "keep";
  if (now.getTime() - candidate.updatedAt.getTime() < IDLE_BEFORE_RETRY_MS) {
    return "keep";
  }
  if (stagedBytes === null) return "fail";
  return stagedBytes === candidate.sizeBytes ? "finalize" : "keep";
}

export async function sweepUploads(
  ports: SweepPorts,
  now: Date = new Date(),
): Promise<{ finalized: number; failed: number; expired: number }> {
  const summary = { finalized: 0, failed: 0, expired: 0 };
  for (const candidate of await ports.listCandidates()) {
    try {
      const action = decideUploadAction(
        candidate,
        await ports.stagedBytes(candidate.id),
        now,
      );
      if (action === "expire") {
        await ports.deleteUpload(candidate);
        summary.expired += 1;
      } else if (action === "fail") {
        await ports.markFailed(candidate.id, "Staged upload file is missing.");
        summary.failed += 1;
      } else if (action === "finalize") {
        await finalizeOrFail(ports, candidate, now, summary);
      }
    } catch (cause) {
      console.warn(`Upload sweep skipped ${candidate.id}`, cause);
    }
  }
  await ports.deleteExpiredTusFiles();
  return summary;
}

async function finalizeOrFail(
  ports: SweepPorts,
  candidate: SweepCandidate,
  now: Date,
  summary: { finalized: number; failed: number },
): Promise<void> {
  try {
    await ports.finalize(candidate);
    summary.finalized += 1;
  } catch (cause) {
    const retryWindowOver =
      candidate.firstFinalizeAttemptAt !== null &&
      now.getTime() - candidate.firstFinalizeAttemptAt.getTime() >
        FINALIZE_RETRY_WINDOW_MS;
    if (!retryWindowOver) throw cause;
    const reason =
      cause instanceof Error ? cause.message : "Finalization failed.";
    await ports.markFailed(candidate.id, reason);
    summary.failed += 1;
  }
}

function databasePorts(options: UploadMaintenanceOptions): SweepPorts {
  return {
    async listCandidates() {
      return db
        .select({
          id: mediaUploads.id,
          projectId: mediaUploads.projectId,
          createdBy: mediaUploads.createdBy,
          status: mediaUploads.status,
          sizeBytes: mediaUploads.sizeBytes,
          firstFinalizeAttemptAt: mediaUploads.firstFinalizeAttemptAt,
          createdAt: mediaUploads.createdAt,
          updatedAt: mediaUploads.updatedAt,
        })
        .from(mediaUploads)
        .where(
          inArray(mediaUploads.status, ["uploading", "finalizing", "failed"]),
        )
        .all() as SweepCandidate[];
    },
    async stagedBytes(uploadId) {
      const file = await stat(stagedUploadPath(uploadId)).catch(() => null);
      return file?.isFile() ? file.size : null;
    },
    async finalize(candidate) {
      await options.finalizeUpload(candidate.id, candidate.createdBy);
    },
    async markFailed(uploadId, reason) {
      db.update(mediaUploads)
        .set({ status: "failed", error: reason })
        .where(
          and(
            eq(mediaUploads.id, uploadId),
            ne(mediaUploads.status, "completed"),
          ),
        )
        .run();
    },
    async deleteUpload(candidate) {
      await options.removeTusUpload(candidate.id);
      deleteUnfinishedUploadProject(candidate.projectId);
    },
    deleteExpiredTusFiles: options.deleteExpiredTusFiles,
  };
}

let sweepRunning = false;

// Only this process touches the database, so skipping a sweep that overlaps a
// running one is all the exclusion needed.
export async function runUploadSweep(
  options: UploadMaintenanceOptions,
  now: Date = new Date(),
): Promise<void> {
  if (sweepRunning) return;
  sweepRunning = true;
  try {
    const summary = await sweepUploads(databasePorts(options), now);
    console.info("Upload sweep finished", summary);
  } finally {
    sweepRunning = false;
  }
}

let started = false;

export function startUploadMaintenance(
  options: UploadMaintenanceOptions,
): void {
  if (started) return;
  started = true;
  const run = () =>
    void runUploadSweep(options).catch((cause) => {
      console.error("Upload sweep failed", cause);
    });
  run();
  setInterval(run, SWEEP_INTERVAL_MS).unref();
}
