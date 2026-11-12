import { sql } from "drizzle-orm";

import { db } from "#lib/server/db/index.ts";

export function GET() {
  try {
    db.get(sql`select 1`);
  } catch (cause) {
    console.error("Health check database query failed", cause);
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
  return Response.json({ status: "ok" });
}
