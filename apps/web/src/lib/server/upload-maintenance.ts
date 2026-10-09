import { stat } from "node:fs/promises";
import { posix } from "node:path";

import { pool } from "$lib/server/db";
import { resolveDataPath } from "$lib/server/media";

export const UPLOAD_EXPIRATION_MS = 7 * 24 * 60 * 60 * 1_000;
const SWEEP_INTERVAL_MS = 15 * 60 * 1_000;
const IDLE_BEFORE_RETRY_MS = 10 * 60 * 1_000;
const FINALIZE_RETRY_WINDOW_MS = 24 * 60 * 60 * 1_000;
const SWEEP_LOCK_KEY = 0x616e7973;

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
      const result = await pool.query<SweepCandidate>(
        `select u.id, u.project_id as "projectId", u.created_by as "createdBy",
                u.status, u.size_bytes::float8 as "sizeBytes",
                u.first_finalize_attempt_at as "firstFinalizeAttemptAt",
                u.created_at as "createdAt", u.updated_at as "updatedAt"
           from media_uploads u
          where u.status in ('uploading', 'finalizing', 'failed')`,
      );
      return result.rows;
    },
    async stagedBytes(uploadId) {
      const file = await stat(
        resolveDataPath(posix.join("staging", "uploads", uploadId)),
      ).catch(() => null);
      return file?.isFile() ? file.size : null;
    },
    async finalize(candidate) {
      await options.finalizeUpload(candidate.id, candidate.createdBy);
    },
    async markFailed(uploadId, reason) {
      await pool.query(
        `update media_uploads
            set status = 'failed', error = $2, updated_at = now()
          where id = $1 and status <> 'completed'`,
        [uploadId, reason],
      );
    },
    async deleteUpload(candidate) {
      await options.removeTusUpload(candidate.id);
      await pool.query(
        `delete from projects where id = $1 and media_original_key is null`,
        [candidate.projectId],
      );
    },
    deleteExpiredTusFiles: options.deleteExpiredTusFiles,
  };
}

export async function runUploadSweep(
  options: UploadMaintenanceOptions,
  now: Date = new Date(),
): Promise<void> {
  const ports = databasePorts(options);
  const client = await pool.connect();
  try {
    const lock = await client.query<{ locked: boolean }>(
      `select pg_try_advisory_lock($1) as locked`,
      [SWEEP_LOCK_KEY],
    );
    if (!lock.rows[0]?.locked) return;
    try {
      const summary = await sweepUploads(ports, now);
      console.info("Upload sweep finished", summary);
    } finally {
      await client.query(`select pg_advisory_unlock($1)`, [SWEEP_LOCK_KEY]);
    }
  } finally {
    client.release();
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
