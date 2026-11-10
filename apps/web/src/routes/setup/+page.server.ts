import { auth } from "$lib/server/auth/auth";
import {
  createInstanceOwner,
  isInstanceInitialized,
  isValidOwnerEmail,
} from "$lib/server/auth/instance";
import { passwordLengthProblem } from "$lib/server/auth/password";
import { isSetupCode } from "$lib/server/auth/setup-code";
import {
  attemptKeys,
  hostCodeThrottle,
  retryMessage,
} from "$lib/server/auth/throttle";
import { OWNER_NAME_MAX_LENGTH } from "$lib/shared/limits";
import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
  if (isInstanceInitialized()) redirect(303, "/login");
};

export const actions: Actions = {
  default: async ({ request, getClientAddress }) => {
    if (isInstanceInitialized()) redirect(303, "/login");
    const form = await request.formData();
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "")
      .trim()
      .toLowerCase();
    const password = String(form.get("password") ?? "");
    const setupCode = String(form.get("setupCode") ?? "");
    const rejected = (field: string, message: string) =>
      fail(400, { field, message, name, email });

    const keys = attemptKeys(getClientAddress());
    const waitMs = hostCodeThrottle.beginAttempt(keys);
    if (waitMs > 0) {
      return fail(429, {
        field: "setupCode",
        message: retryMessage(waitMs),
        name,
        email,
      });
    }
    if (!isSetupCode(setupCode)) {
      return rejected(
        "setupCode",
        "That setup code does not match the one in the log.",
      );
    }
    hostCodeThrottle.recordSuccess(keys);

    if (name.length < 2 || name.length > OWNER_NAME_MAX_LENGTH) {
      return rejected(
        "name",
        `Use between 2 and ${OWNER_NAME_MAX_LENGTH} characters for your name.`,
      );
    }
    if (!isValidOwnerEmail(email)) {
      return rejected("email", "Enter a valid email address.");
    }
    const passwordProblem = passwordLengthProblem(password);
    if (passwordProblem) return rejected("password", passwordProblem);

    const authContext = await auth.$context;
    let outcome;
    try {
      outcome = createInstanceOwner({
        name,
        email,
        passwordHash: await authContext.password.hash(password),
      });
    } catch (cause) {
      console.error("Owner setup failed", cause);
      return rejected(
        "password",
        "The owner account could not be created. Check the details and try again.",
      );
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
