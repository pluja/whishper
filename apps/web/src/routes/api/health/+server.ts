import { pool } from "$lib/server/db";
import { json } from "@sveltejs/kit";

export async function GET() {
  await pool.query("select 1");
  return json({ status: "ok" });
}
