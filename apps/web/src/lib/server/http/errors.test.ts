import { isHttpError } from "@sveltejs/kit";
import { describe, expect, it } from "vitest";

import {
  badRequest,
  clientFailure,
  conflict,
  httpErrorFrom,
  notFound,
  StatusError,
  unprocessable,
} from "./errors";

function thrownBy(action: () => never): unknown {
  try {
    action();
  } catch (thrown) {
    return thrown;
  }
  throw new Error("Expected a throw");
}

describe("status error factories", () => {
  it.each([
    [badRequest, 400],
    [notFound, 404],
    [conflict, 409],
    [unprocessable, 422],
  ] as const)("%o carries status %i", (factory, status) => {
    expect(factory("Reason")).toMatchObject({
      statusCode: status,
      message: "Reason",
    });
  });
});

describe("clientFailure", () => {
  it("exposes the status and message of a 4xx cause", () => {
    expect(clientFailure(conflict("Lease expired"))).toEqual({
      status: 409,
      message: "Lease expired",
    });
  });

  it.each([
    ["a plain error", new Error("disk path /secret")],
    ["a 5xx status", new StatusError(503, "pool exhausted")],
    ["an invalid status", Object.assign(new Error("odd"), { statusCode: "x" })],
    ["a non-error", "boom"],
  ])("treats %s as a server failure", (_label, cause) => {
    expect(clientFailure(cause)).toBeNull();
  });
});

describe("httpErrorFrom", () => {
  it("maps a client failure to an HTTP error with its reason", () => {
    const thrown = thrownBy(() =>
      httpErrorFrom(unprocessable("Adapter cues are not ordered.")),
    );
    expect(isHttpError(thrown)).toBe(true);
    expect(thrown).toMatchObject({
      status: 422,
      body: { message: "Adapter cues are not ordered." },
    });
  });

  it("rethrows a server failure unchanged for the error hook", () => {
    const cause = new Error("disk path /secret");
    expect(thrownBy(() => httpErrorFrom(cause))).toBe(cause);
  });
});
