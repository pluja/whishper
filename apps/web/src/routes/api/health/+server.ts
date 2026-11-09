import { sql } from "drizzle-orm";
import { json } from "@sveltejs/kit";

import { db } from "$lib/server/db";

export function GET() {
  try {
    db.get(sql`select 1`);
  } catch (cause) {
    console.error("Health check database query failed", cause);
    return json({ status: "unavailable" }, { status: 503 });
  }
  return json({ status: "ok" });
}
