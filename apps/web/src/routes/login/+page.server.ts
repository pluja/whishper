import { auth } from "$lib/server/auth/auth";
import { isInstanceInitialized } from "$lib/server/auth/instance";
import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  if (!(await isInstanceInitialized())) redirect(303, "/setup");
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
