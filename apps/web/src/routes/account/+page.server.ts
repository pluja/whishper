import { auth } from "$lib/server/auth/auth";
import { passwordLengthProblem } from "$lib/server/auth/password";
import { requireUserOrLogin } from "$lib/server/auth/session";
import {
  attemptKeys,
  retryMessage,
  signInThrottle,
} from "$lib/server/auth/throttle";
import { fail } from "@sveltejs/kit";
import { APIError } from "better-auth/api";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals }) => {
  requireUserOrLogin(locals);
  return {};
};

export const actions: Actions = {
  changePassword: async ({ locals, request, getClientAddress }) => {
    const user = requireUserOrLogin(locals);
    const form = await request.formData();
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    const rejected = (field: string, message: string, status = 400) =>
      fail(status, { field, message });

    const problem = passwordLengthProblem(newPassword);
    if (problem) return rejected("newPassword", problem);
    if (newPassword !== confirmation) {
      return rejected("confirmation", "The two passwords do not match.");
    }

    // Keyed like sign-in, so a stolen session cannot guess the password faster.
    const keys = attemptKeys(getClientAddress(), user.email);
    const waitMs = signInThrottle.retryAfterMs(keys);
    if (waitMs > 0) {
      return rejected("currentPassword", retryMessage(waitMs), 429);
    }
    try {
      await auth.api.changePassword({
        body: { currentPassword, newPassword, revokeOtherSessions: true },
        headers: request.headers,
      });
    } catch (cause) {
      if (
        cause instanceof APIError &&
        cause.body?.code === "INVALID_PASSWORD"
      ) {
        signInThrottle.recordFailure(keys);
        return rejected(
          "currentPassword",
          "That is not your current password.",
        );
      }
      throw cause;
    }
    signInThrottle.recordSuccess(keys);
    return { changed: true };
  },
};
