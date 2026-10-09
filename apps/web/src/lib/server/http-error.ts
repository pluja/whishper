import { error } from "@sveltejs/kit";

export function httpErrorFrom(cause: unknown, fallbackMessage: string): never {
  const statusCode =
    cause instanceof Error && "statusCode" in cause
      ? Number(cause.statusCode)
      : 500;
  const status =
    Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 600
      ? statusCode
      : 500;
  error(
    status,
    status === 500 || !(cause instanceof Error)
      ? fallbackMessage
      : cause.message,
  );
}
