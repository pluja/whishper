import {
  WORKER_PROTOCOL_VERSION,
  type WorkerManifest,
} from "@anysub/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("$lib/server/db", () => ({ pool: client }));
vi.mock("$lib/server/db/transaction", () => ({
  withTransaction: (work: (c: typeof client) => unknown) => work(client),
}));

import { completeJob, failJob, leaseJob } from "./queue";
import { hashToken } from "$lib/server/util";

const idleWorker: WorkerManifest = {
  protocolVersion: WORKER_PROTOCOL_VERSION,
  workerId: "df5e0394-88e1-4ff1-8033-c0a670f0633e",
  name: "idle",
  version: "0.1.0",
  architecture: "x86_64",
  capabilities: { mediaPreparation: null },
  adapters: [],
  hardware: null,
};

const transcribePayload = {
  kind: "transcribe",
  projectId: "p1",
  runId: "run-1",
};

function runStatusUpdates(): unknown[][] {
  return client.query.mock.calls
    .filter(([sql]) => String(sql).includes("update transcription_runs"))
    .map(([, params]) => params);
}

beforeEach(() => {
  client.query.mockReset();
});

describe("run status follows the job", () => {
  it("fails the run when a lease expires after the last attempt", async () => {
    client.query.mockImplementation(async (sql: string) =>
      sql.includes("update jobs") && sql.includes("lease_expires_at <= now()")
        ? {
            rows: [
              {
                id: "job-1",
                run_id: "run-1",
                state: "failed",
                attempts: 3,
                payload: transcribePayload,
              },
            ],
          }
        : { rows: [] },
    );

    await leaseJob(idleWorker);

    expect(runStatusUpdates()).toEqual([["run-1", "failed"]]);
  });

  it("requeues the run when an expired lease still has attempts left", async () => {
    client.query.mockImplementation(async (sql: string) =>
      sql.includes("lease_expires_at <= now()")
        ? {
            rows: [
              {
                id: "job-1",
                run_id: "run-1",
                state: "queued",
                attempts: 1,
                payload: transcribePayload,
              },
            ],
          }
        : { rows: [] },
    );

    await leaseJob(idleWorker);

    expect(runStatusUpdates()).toEqual([["run-1", "queued"]]);
  });

  it("requeues the run on a retryable failure", async () => {
    client.query.mockImplementation(async (sql: string) =>
      sql.includes("update jobs")
        ? {
            rows: [
              {
                run_id: "run-1",
                state: "queued",
                attempts: 1,
                payload: transcribePayload,
              },
            ],
          }
        : { rows: [] },
    );

    await failJob("job-1", "token", {
      code: "oom",
      message: "out of memory",
      retryable: true,
    });

    expect(runStatusUpdates()).toEqual([["run-1", "queued"]]);
  });

  it("fails the run on a terminal failure", async () => {
    client.query.mockImplementation(async (sql: string) =>
      sql.includes("update jobs")
        ? {
            rows: [
              {
                run_id: "run-1",
                state: "failed",
                attempts: 1,
                payload: transcribePayload,
              },
            ],
          }
        : { rows: [] },
    );

    await failJob("job-1", "token", {
      code: "bad_input",
      message: "bad",
      retryable: false,
    });

    expect(runStatusUpdates()).toEqual([["run-1", "failed"]]);
  });
});

describe("completeJob lease check", () => {
  const completion = { kind: "media_prepare" } as never;

  function lockedRow(overrides: Record<string, unknown>) {
    client.query.mockResolvedValue({
      rows: [
        {
          state: "leased",
          run_id: null,
          workspace_id: "w1",
          attempts: 1,
          payload: transcribePayload,
          lease_accepted: true,
          ...overrides,
        },
      ],
    });
  }

  it("checks token and expiry in the single locking query", async () => {
    lockedRow({ lease_accepted: false });

    await completeJob("job-1", "token", completion);

    expect(client.query).toHaveBeenCalledOnce();
    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toContain("for update");
    expect(sql).toContain("lease_token_hash = $2");
    expect(sql).toContain("lease_expires_at > now()");
    expect(params).toEqual(["job-1", hashToken("token")]);
  });

  it("refuses a wrong token or an expired lease without touching data", async () => {
    lockedRow({ lease_accepted: false });

    await expect(completeJob("job-1", "wrong", completion)).resolves.toBe(
      "lease-rejected",
    );
    expect(client.query).toHaveBeenCalledOnce();
  });

  it("refuses an unknown job", async () => {
    client.query.mockResolvedValue({ rows: [] });

    await expect(completeJob("job-1", "token", completion)).resolves.toBe(
      "lease-rejected",
    );
  });

  it("reports an already completed job even when the lease is gone", async () => {
    lockedRow({ state: "completed", lease_accepted: false });

    await expect(completeJob("job-1", "token", completion)).resolves.toBe(
      "already-completed",
    );
    expect(client.query).toHaveBeenCalledOnce();
  });
});
