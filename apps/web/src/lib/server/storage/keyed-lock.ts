const keyedLockTails = new Map<string, Promise<unknown>>();

// Serializes async work that shares a key within this process, such as file
// steps that must not interleave for one job or one upload.
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
