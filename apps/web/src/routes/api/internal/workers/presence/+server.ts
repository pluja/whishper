import { db } from "#lib/server/db/index.ts";
import { recordWorkerPresence } from "#lib/server/workers/presence.ts";
import { authenticateWorkerManifest } from "#lib/server/workers/request.ts";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async (event) => {
  const manifest = await authenticateWorkerManifest(event);
  recordWorkerPresence(db, manifest);
  return new Response(null, { status: 204 });
};
