import { withTransaction } from "$lib/server/db/transaction";
import {
  cleanupReclaimedArtifacts,
  reclaimExpiredLeases,
} from "$lib/server/jobs/failure";

// Lease requests reclaim expired leases too, but while no worker polls, a job
// whose worker died would otherwise keep its run looking active.
const RECLAIM_INTERVAL_MS = 30_000;

export async function reclaimAbandonedJobs(): Promise<void> {
  const reclaimed = await withTransaction((client) =>
    reclaimExpiredLeases(client),
  );
  await cleanupReclaimedArtifacts(reclaimed);
}

let started = false;

export function startJobMaintenance(): void {
  if (started) return;
  started = true;
  const run = () =>
    void reclaimAbandonedJobs().catch((cause) => {
      console.error("Reclaiming expired job leases failed", cause);
    });
  setInterval(run, RECLAIM_INTERVAL_MS).unref();
}
