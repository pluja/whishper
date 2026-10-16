export function isNodeError(
  cause: unknown,
  code: string,
): cause is NodeJS.ErrnoException {
  return cause instanceof Error && "code" in cause && cause.code === code;
}
