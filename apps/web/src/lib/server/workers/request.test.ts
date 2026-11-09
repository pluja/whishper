import { isHttpError, type RequestEvent } from "@sveltejs/kit";
import { validateJobCompletionReport } from "@anysub/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  authenticateLeaseToken,
  authenticateWorkerManifest,
  authenticateWorkerReport,
} from "./request";

vi.mock("$lib/server/workers/auth", () => ({ authenticateWorker: vi.fn() }));

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

describe("authenticateWorkerReport", () => {
  it("rejects malformed JSON with 400", async () => {
    const thrown = await rejectionOf(
      authenticateWorkerReport(
        eventFor({ body: "{not json" }),
        validateJobCompletionReport,
        "completion",
      ),
    );
    expect(thrown.status).toBe(400);
  });

  it("rejects a non-object body with 400", async () => {
    const thrown = await rejectionOf(
      authenticateWorkerReport(
        eventFor({ body: "[1]" }),
        validateJobCompletionReport,
        "completion",
      ),
    );
    expect(thrown.status).toBe(400);
  });

  it("rejects an invalid completion with a validation message", async () => {
    const thrown = await rejectionOf(
      authenticateWorkerReport(
        eventFor({ body: JSON.stringify({ leaseToken: "token", result: {} }) }),
        validateJobCompletionReport,
        "completion",
      ),
    );
    expect(thrown.status).toBe(400);
    expect(thrown.body.message).toMatch(/^Invalid completion: /);
  });

  it("returns a valid report", async () => {
    const report = await authenticateWorkerReport(
      eventFor({ body: JSON.stringify(completion) }),
      validateJobCompletionReport,
      "completion",
    );
    expect(report).toEqual(completion);
  });
});

describe("authenticateLeaseToken", () => {
  it("returns the lease token header", () => {
    const event = eventFor({ headers: { "x-anysub-lease-token": "token" } });
    expect(authenticateLeaseToken(event)).toBe("token");
  });

  it("rejects a missing lease token with 400", () => {
    expect(() => authenticateLeaseToken(eventFor({}))).toThrowError(
      expect.objectContaining({ status: 400 }),
    );
  });
});

describe("authenticateWorkerManifest", () => {
  const manifest = {
    protocolVersion: "1.0",
    workerId: "6f9619ff-8b86-4d11-b42d-00c04fc964ff",
    name: "local-worker",
    version: "1.0.0",
    architecture: "x86_64",
    capabilities: { mediaPreparation: null },
    adapters: [],
    hardware: null,
  };

  it("returns a valid manifest", async () => {
    const parsed = await authenticateWorkerManifest(
      eventFor({ body: JSON.stringify(manifest) }),
    );
    expect(parsed).toEqual(manifest);
  });

  it("rejects an invalid manifest with 400", async () => {
    const thrown = await rejectionOf(
      authenticateWorkerManifest(
        eventFor({ body: JSON.stringify({ ...manifest, name: 42 }) }),
      ),
    );
    expect(thrown.status).toBe(400);
    expect(thrown.body.message).toMatch(/^Invalid worker manifest: /);
  });

  it("rejects malformed JSON with 400", async () => {
    const thrown = await rejectionOf(
      authenticateWorkerManifest(eventFor({ body: "{not json" })),
    );
    expect(thrown.status).toBe(400);
  });
});
