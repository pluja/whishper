// Calls made while the previous run is still pending are dropped, not queued.
export function singleFlight(task: () => Promise<unknown>): () => void {
  let running = false;
  return () => {
    if (running) return;
    running = true;
    void task().finally(() => {
      running = false;
    });
  };
}
