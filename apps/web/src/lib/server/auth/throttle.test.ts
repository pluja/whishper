import { describe, expect, it } from "vitest";

import {
  attemptKeys,
  createAttemptThrottle,
  retryMessage,
  type AttemptThrottle,
} from "#lib/server/auth/throttle.ts";

const KEYS = attemptKeys("192.0.2.10", "owner@example.test");

// Fails `count` attempts, each as soon as the throttle admits it, and returns
// the time of the last one.
function failInARow(
  throttle: AttemptThrottle,
  keys: string[],
  count: number,
  start = 0,
): number {
  let now = start;
  let failed = 0;
  while (failed < count) {
    const wait = throttle.beginAttempt(keys, now);
    if (wait === 0) failed += 1;
    else now += wait;
  }
  return now;
}

describe("createAttemptThrottle", () => {
  it("admits five attempts that arrive at once and makes the rest wait", () => {
    const throttle = createAttemptThrottle();
    const waits = Array.from({ length: 8 }, () =>
      throttle.beginAttempt(KEYS, 0),
    );
    expect(waits).toEqual([0, 0, 0, 0, 0, 1_000, 1_000, 1_000]);
  });

  it("doubles the delay after each further failure, up to one minute", () => {
    const throttle = createAttemptThrottle();
    let last = failInARow(throttle, KEYS, 5);
    expect(throttle.beginAttempt(KEYS, last)).toBe(1_000);
    last = failInARow(throttle, KEYS, 1, last);
    expect(throttle.beginAttempt(KEYS, last)).toBe(2_000);
    last = failInARow(throttle, KEYS, 20, last);
    expect(throttle.beginAttempt(KEYS, last)).toBe(60_000);
  });

  it("counts the wait from the latest failure", () => {
    const throttle = createAttemptThrottle();
    expect(failInARow(throttle, KEYS, 6, 10_000)).toBe(11_000);
    expect(throttle.beginAttempt(KEYS, 12_500)).toBe(500);
    expect(throttle.beginAttempt(KEYS, 13_000)).toBe(0);
  });

  it("throttles an account attacked from many addresses", () => {
    const throttle = createAttemptThrottle();
    const waits = Array.from({ length: 6 }, (_, index) =>
      throttle.beginAttempt(attemptKeys(`198.51.100.${index}`, "owner"), 0),
    );
    expect(waits.at(-1)).toBe(1_000);
    expect(throttle.beginAttempt(attemptKeys("203.0.113.1", "owner"), 0)).toBe(
      1_000,
    );
  });

  it("throttles one address that sprays many accounts", () => {
    const throttle = createAttemptThrottle();
    const waits = Array.from({ length: 6 }, (_, index) =>
      throttle.beginAttempt(attemptKeys("192.0.2.99", `user${index}`), 0),
    );
    expect(waits.at(-1)).toBe(1_000);
    expect(throttle.beginAttempt(attemptKeys("192.0.2.99", "owner"), 0)).toBe(
      1_000,
    );
  });

  it("forgets failures after fifteen quiet minutes", () => {
    const throttle = createAttemptThrottle();
    const later = failInARow(throttle, KEYS, 10) + 15 * 60_000 + 1;
    expect(throttle.beginAttempt(KEYS, later)).toBe(0);
    expect(throttle.beginAttempt(KEYS, later)).toBe(0);
  });

  it("clears the keys of a successful attempt", () => {
    const throttle = createAttemptThrottle();
    const last = failInARow(throttle, KEYS, 8);
    throttle.recordSuccess(KEYS);
    expect(throttle.beginAttempt(KEYS, last)).toBe(0);
  });

  it("keeps tracking the newest keys when it reaches its size limit", () => {
    const throttle = createAttemptThrottle();
    const target = attemptKeys("192.0.2.1");
    const last = failInARow(throttle, target, 6);
    for (let index = 0; index < 10_000; index += 1) {
      throttle.beginAttempt([`address:filler-${index}`], last);
    }
    expect(throttle.beginAttempt(target, last)).toBe(0);
    expect(throttle.beginAttempt(target, last)).toBe(0);
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
