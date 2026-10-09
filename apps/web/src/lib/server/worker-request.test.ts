import { isHttpError, type RequestEvent } from "@sveltejs/kit";
import { validateJobCompletionReport } from "@anysub/contracts";
import { describe, expect, it, vi } from "vitest";

import { readWorkerReport, requireWorkerLeaseToken } from "./worker-request";

vi.mock("$lib/server/worker-auth", () => ({ requireWorker: vi.fn() }));

function eventFor(init: RequestInit): RequestEvent {
  return {
    request: new Request("http://localhost/api/internal", {
      method: "POST",
      ...init,
    }),
  } as RequestEvent;
}

async function rejectionOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (thrown) {
    if (isHttpError(thrown)) return thrown;
  }
  throw new Error("Expected an HTTP error");
}

const completion = {
  leaseToken: "token",
  result: {
    kind: "transcribe",
    artifact: {
      schemaVersion: "1.0",
      language: "en",
      durationUs: 1_000,
      cues: [],
      metadata: {},
    },
    adapter: { id: "builtin.fake", version: "1.0.0", modelId: "fake" },
  },
};

describe("readWorkerReport", () => {
  it("rejects malformed JSON with 400", async () => {
    const thrown = await rejectionOf(
      readWorkerReport(
        eventFor({ body: "{not json" }),
        validateJobCompletionReport,
        "completion",
      ),
    );
    expect(thrown.status).toBe(400);
  });

  it("rejects a non-object body with 400", async () => {
    const thrown = await rejectionOf(
      readWorkerReport(
        eventFor({ body: "[1]" }),
        validateJobCompletionReport,
        "completion",
      ),
    );
    expect(thrown.status).toBe(400);
  });

  it("rejects an invalid completion with a validation message", async () => {
    const thrown = await rejectionOf(
      readWorkerReport(
        eventFor({ body: JSON.stringify({ leaseToken: "token", result: {} }) }),
        validateJobCompletionReport,
        "completion",
      ),
    );
    expect(thrown.status).toBe(400);
    expect(thrown.body.message).toMatch(/^Invalid completion: /);
  });

  it("returns a valid report", async () => {
    const report = await readWorkerReport(
      eventFor({ body: JSON.stringify(completion) }),
      validateJobCompletionReport,
      "completion",
    );
    expect(report).toEqual(completion);
  });
});

describe("requireWorkerLeaseToken", () => {
  it("returns the lease token header", () => {
    const event = eventFor({ headers: { "x-anysub-lease-token": "token" } });
    expect(requireWorkerLeaseToken(event)).toBe("token");
  });

  it("rejects a missing lease token with 400", () => {
    expect(() => requireWorkerLeaseToken(eventFor({}))).toThrowError(
      expect.objectContaining({ status: 400 }),
    );
  });
});
