import { auth } from "$lib/server/auth/auth";
import {
  createInstanceOwner,
  isInstanceInitialized,
  isValidOwnerEmail,
} from "$lib/server/auth/instance";
import { isSetupCode } from "$lib/server/auth/setup-code";
import {
  attemptKeys,
  hostCodeThrottle,
  retryMessage,
} from "$lib/server/auth/throttle";
import {
  OWNER_NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "$lib/shared/limits";
import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
  if (await isInstanceInitialized()) redirect(303, "/login");
};

export const actions: Actions = {
  default: async ({ request, getClientAddress }) => {
    if (await isInstanceInitialized()) redirect(303, "/login");
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
    const waitMs = hostCodeThrottle.retryAfterMs(keys);
    if (waitMs > 0) {
      return fail(429, {
        field: "setupCode",
        message: retryMessage(waitMs),
        name,
        email,
      });
    }
    if (!isSetupCode(setupCode)) {
      hostCodeThrottle.recordFailure(keys);
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
    if (
      password.length < PASSWORD_MIN_LENGTH ||
      password.length > PASSWORD_MAX_LENGTH
    ) {
      return rejected(
        "password",
        `Use between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters for your password.`,
      );
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
