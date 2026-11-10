import { isInstanceInitialized } from "$lib/server/auth/instance";
import {
  passwordLengthProblem,
  resetPassword,
} from "$lib/server/auth/password";
import {
  clearRecoveryCode,
  isRecoveryCode,
  issueRecoveryCode,
} from "$lib/server/auth/recovery-code";
import {
  attemptKeys,
  hostCodeThrottle,
  retryMessage,
} from "$lib/server/auth/throttle";
import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  if (!isInstanceInitialized()) redirect(303, "/setup");
  if (locals.user) redirect(303, "/account");
  return {};
};

export const actions: Actions = {
  request: async () => {
    issueRecoveryCode();
    return { requested: true };
  },
  reset: async ({ request, getClientAddress }) => {
    const form = await request.formData();
    const email = String(form.get("email") ?? "")
      .trim()
      .toLowerCase();
    const code = String(form.get("recoveryCode") ?? "");
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    const rejected = (field: string, message: string, status = 400) =>
      fail(status, { requested: true, field, message, email });

    const keys = attemptKeys(getClientAddress());
    const waitMs = hostCodeThrottle.beginAttempt(keys);
    if (waitMs > 0) {
      return rejected("recoveryCode", retryMessage(waitMs), 429);
    }
    if (!isRecoveryCode(code)) {
      return rejected(
        "recoveryCode",
        "That code does not match the latest one in the log, or it is older than 15 minutes.",
      );
    }
    hostCodeThrottle.recordSuccess(keys);

    const passwordProblem = passwordLengthProblem(password);
    if (passwordProblem) return rejected("password", passwordProblem);
    if (password !== confirmation) {
      return rejected("confirmation", "The two passwords do not match.");
    }
    if (!(await resetPassword(email, password))) {
      return rejected("email", "No account uses that email address.");
    }
    clearRecoveryCode();
    redirect(303, "/login?reset=1");
  },
};
