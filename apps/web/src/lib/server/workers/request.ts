import type { ProtocolValidator } from "@anysub/contracts";
import { parseProtocolMessage } from "@anysub/contracts";
import { error, type RequestEvent } from "@sveltejs/kit";

import { authenticateWorker } from "$lib/server/workers/auth";

export const LEASE_TOKEN_HEADER = "x-anysub-lease-token";

export async function authenticateWorkerReport<T>(
  event: RequestEvent,
  validate: ProtocolValidator<T>,
  description: string,
): Promise<T> {
  authenticateWorker(event);
  let body: unknown;
  try {
    body = await event.request.json();
  } catch {
    error(400, `Invalid ${description}: body must be valid JSON`);
  }
  const report = parseProtocolMessage(validate, body);
  if (!report.ok) {
    error(400, `Invalid ${description}: ${report.errors.join("; ")}`);
  }
  return report.value;
}

export function authenticateLeaseToken(event: RequestEvent): string {
  authenticateWorker(event);
  const leaseToken = event.request.headers.get(LEASE_TOKEN_HEADER);
  if (!leaseToken) error(400, "An active lease is required");
  return leaseToken;
}

export function rejectLease(): never {
  error(409, "Lease is no longer active");
}
