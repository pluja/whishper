import { error } from "@sveltejs/kit";

export class StatusError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "StatusError";
  }
}

// A server failure whose message is safe to show. The handleError hook logs
// the cause and answers with this message instead of a generic one.
export class ServerFailure extends Error {
  constructor(publicMessage: string, options: { cause: unknown }) {
    super(publicMessage, options);
    this.name = "ServerFailure";
  }
}

export function badRequest(message: string): StatusError {
  return new StatusError(400, message);
}

export function notFound(message: string): StatusError {
  return new StatusError(404, message);
}

export function conflict(message: string): StatusError {
  return new StatusError(409, message);
}

export function unprocessable(message: string): StatusError {
  return new StatusError(422, message);
}

export type ClientFailure = { status: number; message: string };

// Only 4xx causes are the client's to see. Anything else is a server failure
// whose message may leak internals, so it yields null.
export function clientFailure(cause: unknown): ClientFailure | null {
  if (!(cause instanceof Error) || !("statusCode" in cause)) return null;
  const status = Number(cause.statusCode);
  return Number.isInteger(status) && status >= 400 && status < 500
    ? { status, message: cause.message }
    : null;
}

// Server failures propagate unchanged to the handleError hook, which logs
// them and answers with a generic message.
export function httpErrorFrom(cause: unknown): never {
  const failure = clientFailure(cause);
  if (failure) error(failure.status, failure.message);
  throw cause;
}
