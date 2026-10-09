import { pool } from "$lib/server/db";
import { json } from "@sveltejs/kit";

export async function GET() {
  try {
    await pool.query("select 1");
  } catch (cause) {
    console.error("Health check database query failed", cause);
    return json({ status: "unavailable" }, { status: 503 });
  }
  return json({ status: "ok" });
}
