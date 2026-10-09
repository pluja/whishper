import { createHash } from "node:crypto";
import { link, stat } from "node:fs/promises";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isNodeError(
  cause: unknown,
  code: string,
): cause is NodeJS.ErrnoException {
  return cause instanceof Error && "code" in cause && cause.code === code;
}

const keyedLockTails = new Map<string, Promise<unknown>>();

export async function withKeyedLock<T>(
  key: string,
  work: () => Promise<T>,
): Promise<T> {
  const previous = keyedLockTails.get(key) ?? Promise.resolve();
  const run = previous.then(work, work);
  const tail = run.catch(() => undefined);
  keyedLockTails.set(key, tail);
  try {
    return await run;
  } finally {
    if (keyedLockTails.get(key) === tail) keyedLockTails.delete(key);
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Hard links source to destination. An existing destination is accepted only
 * when it is already the same file, so retries are safe. Returns whether this
 * call created the link.
 */
export async function linkIdempotent(
  source: string,
  destination: string,
): Promise<boolean> {
  try {
    await link(source, destination);
    return true;
  } catch (cause) {
    if (!isNodeError(cause, "EEXIST")) throw cause;
    const [sourceStat, destinationStat] = await Promise.all([
      stat(source),
      stat(destination),
    ]);
    if (
      sourceStat.dev !== destinationStat.dev ||
      sourceStat.ino !== destinationStat.ino ||
      sourceStat.size !== destinationStat.size
    ) {
      throw new Error(`Destination ${destination} is already occupied.`);
    }
    return false;
  }
}
