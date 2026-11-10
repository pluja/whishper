import { APIError } from "better-auth/api";

export function isAuthError(cause: unknown, codes: string[]): boolean {
  return cause instanceof APIError && codes.includes(cause.body?.code ?? "");
}
