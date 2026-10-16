import { link, stat } from "node:fs/promises";

import { isNodeError } from "$lib/server/guards";

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
