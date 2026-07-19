import { timingSafeEqual } from "node:crypto";

import { error, type RequestEvent } from "@sveltejs/kit";

import { privateEnv } from "$lib/server/env";

export function requireWorker(event: RequestEvent): void {
  const authorization = event.request.headers.get("authorization");
  const provided = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  const expected = privateEnv.workerToken;

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    error(401, "Worker authentication failed");
  }
}
