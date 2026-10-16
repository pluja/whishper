import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/db", () => ({ pool: { query: vi.fn() } }));
vi.mock("$lib/server/db/transaction", () => ({ withTransaction: vi.fn() }));

import {
  decideUploadAction,
  runUploadSweep,
  sweepUploads,
  UPLOAD_EXPIRATION_MS,
  type SweepCandidate,
  type SweepPorts,
} from "./maintenance";

const HOUR = 60 * 60 * 1_000;
const now = new Date("2026-01-20T12:00:00Z");

function candidate(overrides: Partial<SweepCandidate> = {}): SweepCandidate {
  return {
    id: "u1",
    projectId: "p1",
    createdBy: "user",
    status: "uploading",
    sizeBytes: 100,
    firstFinalizeAttemptAt: null,
    createdAt: new Date(now.getTime() - 2 * HOUR),
    updatedAt: new Date(now.getTime() - HOUR),
    ...overrides,
  };
}

describe("decideUploadAction", () => {
  it("finalizes a fully staged upload that has gone idle", () => {
    expect(decideUploadAction(candidate(), 100, now)).toBe("finalize");
  });

  it("keeps recently touched and partially staged uploads", () => {
    const fresh = candidate({ updatedAt: new Date(now.getTime() - 1_000) });
    expect(decideUploadAction(fresh, 100, now)).toBe("keep");
    expect(decideUploadAction(candidate(), 40, now)).toBe("keep");
  });

  it("fails an idle upload whose staged file is gone", () => {
    expect(decideUploadAction(candidate(), null, now)).toBe("fail");
  });

  it("never retries a failed upload but expires it with the others", () => {
    expect(decideUploadAction(candidate({ status: "failed" }), 100, now)).toBe(
      "keep",
    );
    const old = candidate({
      status: "failed",
      createdAt: new Date(now.getTime() - UPLOAD_EXPIRATION_MS - 1),
    });
    expect(decideUploadAction(old, 100, now)).toBe("expire");
  });
});

function ports(overrides: Partial<SweepPorts>): SweepPorts {
  return {
    listCandidates: async () => [],
    stagedBytes: async () => 100,
    finalize: vi.fn(),
    markFailed: vi.fn(),
    deleteUpload: vi.fn(),
    deleteExpiredTusFiles: vi.fn(),
    ...overrides,
  };
}

describe("sweepUploads", () => {
  it("finalizes, fails and expires according to the injected clock", async () => {
    const expired = candidate({
      id: "old",
      createdAt: new Date(now.getTime() - UPLOAD_EXPIRATION_MS - HOUR),
    });
    const missing = candidate({ id: "missing" });
    const ready = candidate({ id: "ready" });
    const sizes: Record<string, number | null> = {
      old: 10,
      missing: null,
      ready: 100,
    };
    const sweepPorts = ports({
      listCandidates: async () => [expired, missing, ready],
      stagedBytes: async (id) => sizes[id],
    });

    const summary = await sweepUploads(sweepPorts, now);

    expect(summary).toEqual({ finalized: 1, failed: 1, expired: 1 });
    expect(sweepPorts.deleteUpload).toHaveBeenCalledWith(expired);
    expect(sweepPorts.markFailed).toHaveBeenCalledWith(
      "missing",
      expect.any(String),
    );
    expect(sweepPorts.finalize).toHaveBeenCalledWith(ready);
    expect(sweepPorts.deleteExpiredTusFiles).toHaveBeenCalledOnce();
  });

  it("retries a failing finalization until the retry window closes", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const finalize = vi.fn().mockRejectedValue(new Error("disk full"));
    const markFailed = vi.fn();
    const young = candidate();
    const stale = candidate({
      id: "stale",
      firstFinalizeAttemptAt: new Date(now.getTime() - 25 * HOUR),
    });
    const slowTransfer = candidate({
      id: "slow",
      createdAt: new Date(now.getTime() - 48 * HOUR),
    });
    const summary = await sweepUploads(
      ports({
        listCandidates: async () => [young, slowTransfer, stale],
        finalize,
        markFailed,
      }),
      now,
    );
    expect(summary).toEqual({ finalized: 0, failed: 1, expired: 0 });
    expect(markFailed).toHaveBeenCalledOnce();
    expect(markFailed).toHaveBeenCalledWith("stale", "disk full");
  });
});

describe("runUploadSweep lock handling", () => {
  async function setup(unlockFails: boolean) {
    const { pool } = await import("$lib/server/db");
    const release = vi.fn();
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("pg_try_advisory_lock")) {
        return { rows: [{ locked: true }] };
      }
      if (sql.includes("pg_advisory_unlock") && unlockFails) {
        throw new Error("unlock failed");
      }
      return { rows: [] };
    });
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never);
    (pool as unknown as { connect: unknown }).connect = vi.fn(async () => ({
      query,
      release,
    }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    return { release };
  }

  it("returns the connection to the pool after a clean unlock", async () => {
    const { release } = await setup(false);
    await runUploadSweep({
      finalizeUpload: vi.fn(),
      removeTusUpload: vi.fn(),
      deleteExpiredTusFiles: vi.fn(),
    });
    expect(release).toHaveBeenCalledWith(false);
  });

  it("destroys the connection and keeps the sweep error when unlock fails", async () => {
    const { release } = await setup(true);
    await expect(
      runUploadSweep({
        finalizeUpload: vi.fn(),
        removeTusUpload: vi.fn(),
        deleteExpiredTusFiles: vi.fn().mockRejectedValue(new Error("sweep")),
      }),
    ).rejects.toThrow("sweep");
    expect(release).toHaveBeenCalledWith(true);
  });
});
