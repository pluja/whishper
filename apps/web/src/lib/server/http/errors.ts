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

export function publicFailure(
  cause: unknown,
  fallbackMessage: string,
): { status: number; message: string } {
  const statusCode =
    cause instanceof Error && "statusCode" in cause
      ? Number(cause.statusCode)
      : 500;
  const status =
    Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 600
      ? statusCode
      : 500;
  const message =
    status >= 500 || !(cause instanceof Error)
      ? fallbackMessage
      : cause.message;
  return { status, message };
}

export function httpErrorFrom(cause: unknown, fallbackMessage: string): never {
  const { status, message } = publicFailure(cause, fallbackMessage);
  error(status, message);
}

export function unprocessable(message: string): StatusError {
  return new StatusError(422, message);
}
