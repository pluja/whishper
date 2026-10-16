import { describe, expect, it, vi } from "vitest";

import { singleFlight } from "./single-flight";

function deferredTask() {
  const finishers: (() => void)[] = [];
  const task = vi.fn(
    () => new Promise<void>((resolve) => finishers.push(resolve)),
  );
  return { task, finish: () => finishers.shift()?.() };
}

describe("singleFlight", () => {
  it("drops calls while a run is pending", () => {
    const { task } = deferredTask();
    const run = singleFlight(task);

    run();
    run();
    run();

    expect(task).toHaveBeenCalledTimes(1);
  });

  it("runs again once the previous run settles", async () => {
    const { task, finish } = deferredTask();
    const run = singleFlight(task);

    run();
    finish();
    await Promise.resolve();
    await Promise.resolve();
    run();

    expect(task).toHaveBeenCalledTimes(2);
  });
});
