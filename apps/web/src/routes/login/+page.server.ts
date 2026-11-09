import { auth } from "$lib/server/auth/auth";
import { isInstanceInitialized } from "$lib/server/auth/instance";
import {
  attemptKeys,
  retryMessage,
  signInThrottle,
} from "$lib/server/auth/throttle";
import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!(await isInstanceInitialized())) redirect(303, "/setup");
  if (locals.user) redirect(303, "/");
  return { passwordReset: url.searchParams.get("reset") === "1" };
};

export const actions: Actions = {
  default: async ({ request, getClientAddress }) => {
    const form = await request.formData();
    const email = String(form.get("email") ?? "")
      .trim()
      .toLowerCase();
    const password = String(form.get("password") ?? "");
    const keys = attemptKeys(getClientAddress(), email);
    const waitMs = signInThrottle.retryAfterMs(keys);
    if (waitMs > 0) return fail(429, { message: retryMessage(waitMs) });
    try {
      await auth.api.signInEmail({
        body: { email, password },
        headers: request.headers,
      });
    } catch {
      signInThrottle.recordFailure(keys);
      return fail(400, {
        message: "The email or password did not match an account.",
      });
    }
    signInThrottle.recordSuccess(keys);
    redirect(303, "/");
  },
};
