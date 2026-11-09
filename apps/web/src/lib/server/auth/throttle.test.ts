import { describe, expect, it } from "vitest";

import {
  attemptKeys,
  createAttemptThrottle,
  retryMessage,
} from "$lib/server/auth/throttle";

const KEYS = attemptKeys("192.0.2.10", "owner@example.test");

function failTimes(
  throttle: ReturnType<typeof createAttemptThrottle>,
  keys: string[],
  count: number,
  now: number,
) {
  for (let attempt = 0; attempt < count; attempt += 1) {
    throttle.recordFailure(keys, now);
  }
}

describe("createAttemptThrottle", () => {
  it("lets the first five failures through without a delay", () => {
    const throttle = createAttemptThrottle();
    failTimes(throttle, KEYS, 4, 0);
    expect(throttle.retryAfterMs(KEYS, 0)).toBe(0);
  });

  it("doubles the delay after each further failure, up to one minute", () => {
    const throttle = createAttemptThrottle();
    failTimes(throttle, KEYS, 5, 0);
    expect(throttle.retryAfterMs(KEYS, 0)).toBe(1_000);
    throttle.recordFailure(KEYS, 0);
    expect(throttle.retryAfterMs(KEYS, 0)).toBe(2_000);
    failTimes(throttle, KEYS, 20, 0);
    expect(throttle.retryAfterMs(KEYS, 0)).toBe(60_000);
  });

  it("counts the wait from the latest failure", () => {
    const throttle = createAttemptThrottle();
    failTimes(throttle, KEYS, 6, 10_000);
    expect(throttle.retryAfterMs(KEYS, 11_500)).toBe(500);
    expect(throttle.retryAfterMs(KEYS, 12_000)).toBe(0);
  });

  it("throttles an account attacked from many addresses", () => {
    const throttle = createAttemptThrottle();
    for (let index = 0; index < 6; index += 1) {
      throttle.recordFailure(attemptKeys(`198.51.100.${index}`, "owner"), 0);
    }
    expect(throttle.retryAfterMs(attemptKeys("203.0.113.1", "owner"), 0)).toBe(
      2_000,
    );
  });

  it("throttles one address that sprays many accounts", () => {
    const throttle = createAttemptThrottle();
    for (let index = 0; index < 6; index += 1) {
      throttle.recordFailure(attemptKeys("192.0.2.99", `user${index}`), 0);
    }
    expect(throttle.retryAfterMs(attemptKeys("192.0.2.99", "owner"), 0)).toBe(
      2_000,
    );
  });

  it("forgets failures after fifteen quiet minutes", () => {
    const throttle = createAttemptThrottle();
    failTimes(throttle, KEYS, 10, 0);
    const later = 15 * 60_000 + 1;
    expect(throttle.retryAfterMs(KEYS, later)).toBe(0);
    throttle.recordFailure(KEYS, later);
    expect(throttle.retryAfterMs(KEYS, later)).toBe(0);
  });

  it("clears the keys of a successful attempt", () => {
    const throttle = createAttemptThrottle();
    failTimes(throttle, KEYS, 8, 0);
    throttle.recordSuccess(KEYS);
    expect(throttle.retryAfterMs(KEYS, 0)).toBe(0);
  });

  it("keeps tracking the newest keys when it reaches its size limit", () => {
    const throttle = createAttemptThrottle();
    const target = attemptKeys("192.0.2.1");
    failTimes(throttle, target, 6, 0);
    for (let index = 0; index < 10_000; index += 1) {
      throttle.recordFailure([`address:filler-${index}`], 1);
    }
    expect(throttle.retryAfterMs(target, 1)).toBe(0);
    throttle.recordFailure(target, 2);
    expect(throttle.retryAfterMs(target, 2)).toBe(0);
  });
});

describe("retryMessage", () => {
  it("rounds up to whole seconds", () => {
    expect(retryMessage(1)).toBe(
      "Too many failed attempts. Try again in 1 second.",
    );
    expect(retryMessage(59_001)).toBe(
      "Too many failed attempts. Try again in 60 seconds.",
    );
  });
});
