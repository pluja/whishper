import { timingSafeEqual } from "node:crypto";

import { error, type RequestEvent } from "@sveltejs/kit";

import { privateEnv } from "$lib/server/env";

export function isAuthenticatedWorker(request: Request): boolean {
  const authorization = request.headers.get("authorization");
  const provided = Buffer.from(
    authorization?.startsWith("Bearer ") ? authorization.slice(7) : "",
  );
  const expected = Buffer.from(privateEnv.workerToken);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

export function authenticateWorker(event: RequestEvent): void {
  if (!isAuthenticatedWorker(event.request)) {
    error(401, "Worker authentication failed");
  }
}
