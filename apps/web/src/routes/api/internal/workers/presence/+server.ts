import { pool } from "$lib/server/db";
import { recordWorkerPresence } from "$lib/server/workers/presence";
import { authenticateWorkerManifest } from "$lib/server/workers/request";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async (event) => {
  const manifest = await authenticateWorkerManifest(event);
  await recordWorkerPresence(pool, manifest);
  return new Response(null, { status: 204 });
};
