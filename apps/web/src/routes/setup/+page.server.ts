import { auth } from "$lib/server/auth";
import {
  createInstanceOwner,
  isInstanceInitialized,
} from "$lib/server/instance";
import { fail, redirect, type Actions } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
  if (await isInstanceInitialized()) redirect(303, "/login");
  return {};
};

export const actions: Actions = {
  default: async ({ request }) => {
    const form = await request.formData();
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "")
      .trim()
      .toLowerCase();
    const password = String(form.get("password") ?? "");
    const authContext = await auth.$context;
    const { minPasswordLength, maxPasswordLength } =
      authContext.password.config;

    if (name.length < 2)
      return fail(400, {
        message: "Use at least two characters for your name.",
      });
    if (!email.includes("@"))
      return fail(400, { message: "Enter a valid email address." });
    if (
      password.length < minPasswordLength ||
      password.length > maxPasswordLength
    ) {
      return fail(400, {
        message: `Use between ${minPasswordLength} and ${maxPasswordLength} characters for your password.`,
      });
    }

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
