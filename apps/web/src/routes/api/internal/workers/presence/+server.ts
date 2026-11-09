import { db } from "$lib/server/db";
import { recordWorkerPresence } from "$lib/server/workers/presence";
import { authenticateWorkerManifest } from "$lib/server/workers/request";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async (event) => {
  const manifest = await authenticateWorkerManifest(event);
  recordWorkerPresence(db, manifest);
  return new Response(null, { status: 204 });
};
