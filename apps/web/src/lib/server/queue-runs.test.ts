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

import { failJob, leaseJob } from "./queue";

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
