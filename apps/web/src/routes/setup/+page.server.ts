import { auth } from "$lib/server/auth/auth";
import {
  createInstanceOwner,
  isInstanceInitialized,
  isValidOwnerEmail,
} from "$lib/server/auth/instance";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "$lib/shared/limits";
import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
  if (await isInstanceInitialized()) redirect(303, "/login");
};

export const actions: Actions = {
  default: async ({ request }) => {
    if (await isInstanceInitialized()) redirect(303, "/login");
    const form = await request.formData();
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "")
      .trim()
      .toLowerCase();
    const password = String(form.get("password") ?? "");

    if (name.length < 2)
      return fail(400, {
        message: "Use at least two characters for your name.",
      });
    if (!isValidOwnerEmail(email))
      return fail(400, { message: "Enter a valid email address." });
    if (
      password.length < PASSWORD_MIN_LENGTH ||
      password.length > PASSWORD_MAX_LENGTH
    ) {
      return fail(400, {
        message: `Use between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters for your password.`,
      });
    }

    const authContext = await auth.$context;
    let outcome;
    try {
      outcome = await createInstanceOwner({
        name,
        email,
        passwordHash: await authContext.password.hash(password),
      });
    } catch (cause) {
      console.error("Owner setup failed", cause);
      return fail(400, {
        message:
          "The owner account could not be created. Check the details and try again.",
      });
    }
    if (outcome === "already-initialized") redirect(303, "/login");

    try {
      await auth.api.signInEmail({
        body: { email, password },
        headers: request.headers,
      });
    } catch (cause) {
      console.error("Signing in the new owner failed", cause);
      redirect(303, "/login");
    }
    redirect(303, "/");
  },
};
