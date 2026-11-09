// A short, capped delay instead of a lockout: an attacker who keeps failing on
// purpose can only make the owner wait a minute, not lock them out.
const FREE_FAILURES = 5;
const FIRST_DELAY_MS = 1_000;
const MAX_DELAY_MS = 60_000;
const FORGET_AFTER_MS = 15 * 60_000;
const MAX_TRACKED_KEYS = 10_000;

type FailureRecord = { failures: number; lastFailureAt: number };

export type AttemptThrottle = {
  retryAfterMs(keys: string[], now?: number): number;
  recordFailure(keys: string[], now?: number): void;
  recordSuccess(keys: string[]): void;
};

function delayAfter(failures: number): number {
  if (failures < FREE_FAILURES) return 0;
  return Math.min(
    FIRST_DELAY_MS * 2 ** (failures - FREE_FAILURES),
    MAX_DELAY_MS,
  );
}

export function createAttemptThrottle(): AttemptThrottle {
  // Map iteration follows insertion order, and every failure re-inserts its
  // key, so the first entries are always the ones that failed longest ago.
  const records = new Map<string, FailureRecord>();

  function current(key: string, now: number): FailureRecord | undefined {
    const record = records.get(key);
    if (record && now - record.lastFailureAt > FORGET_AFTER_MS) {
      records.delete(key);
      return undefined;
    }
    return record;
  }

  function evictOldest(): void {
    for (const key of records.keys()) {
      if (records.size <= MAX_TRACKED_KEYS) return;
      records.delete(key);
    }
  }

  return {
    retryAfterMs(keys, now = Date.now()) {
      let wait = 0;
      for (const key of keys) {
        const record = current(key, now);
        if (!record) continue;
        const remaining =
          record.lastFailureAt + delayAfter(record.failures) - now;
        wait = Math.max(wait, remaining);
      }
      return wait;
    },
    recordFailure(keys, now = Date.now()) {
      for (const key of keys) {
        const failures = (current(key, now)?.failures ?? 0) + 1;
        records.delete(key);
        records.set(key, { failures, lastFailureAt: now });
      }
      evictOldest();
    },
    recordSuccess(keys) {
      for (const key of keys) records.delete(key);
    },
  };
}

export function attemptKeys(clientAddress: string, account?: string): string[] {
  const keys = [`address:${clientAddress}`];
  if (account) keys.push(`account:${account}`);
  return keys;
}

export function retryMessage(waitMs: number): string {
  const seconds = Math.ceil(waitMs / 1000);
  return `Too many failed attempts. Try again in ${seconds} ${seconds === 1 ? "second" : "seconds"}.`;
}

export const signInThrottle = createAttemptThrottle();
