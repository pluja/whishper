import { isHttpError } from "@sveltejs/kit";
import { describe, expect, it } from "vitest";

import { httpErrorFrom, StatusError, unprocessable } from "./http-error";

function thrownBy(action: () => never) {
  try {
    action();
  } catch (thrown) {
    if (isHttpError(thrown)) return thrown;
  }
  throw new Error("Expected an HTTP error");
}

describe("httpErrorFrom", () => {
  it("keeps the status and message of a client error", () => {
    const cause = Object.assign(new Error("Lease expired"), {
      statusCode: 409,
    });
    const thrown = thrownBy(() => httpErrorFrom(cause, "Transfer failed"));
    expect(thrown.status).toBe(409);
    expect(thrown.body.message).toBe("Lease expired");
  });

  it("hides the message of server failures", () => {
    const thrown = thrownBy(() =>
      httpErrorFrom(new Error("disk path /secret"), "Transfer failed"),
    );
    expect(thrown.status).toBe(500);
    expect(thrown.body.message).toBe("Transfer failed");
  });

  it("hides the message of every 5xx status", () => {
    const thrown = thrownBy(() =>
      httpErrorFrom(new StatusError(503, "pool exhausted"), "Transfer failed"),
    );
    expect(thrown.status).toBe(503);
    expect(thrown.body.message).toBe("Transfer failed");
  });

  it("maps an unprocessable completion to a 422 with its reason", () => {
    const thrown = thrownBy(() =>
      httpErrorFrom(unprocessable("Adapter cues are not ordered."), "Failed"),
    );
    expect(thrown.status).toBe(422);
    expect(thrown.body.message).toBe("Adapter cues are not ordered.");
  });

  it("falls back to 500 for non-error causes and invalid status codes", () => {
    expect(thrownBy(() => httpErrorFrom("boom", "Failed")).status).toBe(500);
    const cause = Object.assign(new Error("odd"), { statusCode: "nope" });
    expect(thrownBy(() => httpErrorFrom(cause, "Failed")).status).toBe(500);
  });
});
