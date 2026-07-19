import { auth } from "$lib/server/auth";
import { pool } from "$lib/server/db";
import { fail, redirect, type Actions } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  const initialized = await pool.query(
    "select exists(select 1 from auth_users) as value",
  );
  if (!initialized.rows[0].value) redirect(303, "/setup");
  if (locals.user) redirect(303, "/");
  return {};
};

export const actions: Actions = {
  default: async ({ request }) => {
    const form = await request.formData();
    const email = String(form.get("email") ?? "")
      .trim()
      .toLowerCase();
    const password = String(form.get("password") ?? "");
    try {
      await auth.api.signInEmail({
        body: { email, password },
        headers: request.headers,
      });
    } catch {
      return fail(400, {
        message: "The email or password did not match an account.",
      });
    }
    redirect(303, "/");
  },
};
