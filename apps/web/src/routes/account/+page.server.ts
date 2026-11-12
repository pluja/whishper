import {
  createApiToken,
  listApiTokens,
  parseNewApiToken,
  revokeAllApiTokens,
  revokeApiToken,
} from "#lib/server/auth/api-tokens.ts";
import { auth } from "#lib/server/auth/auth.ts";
import { isAuthError } from "#lib/server/auth/errors.ts";
import {
  isCurrentPassword,
  passwordLengthProblem,
} from "#lib/server/auth/password.ts";
import { requireUserOrLogin } from "#lib/server/auth/session.ts";
import {
  attemptKeys,
  retryMessage,
  signInThrottle,
} from "#lib/server/auth/throttle.ts";
import { runFormAction } from "#lib/server/http/actions.ts";
import { badRequest } from "#lib/server/http/errors.ts";
import { isUuid } from "#lib/shared/uuid.ts";
import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals }) => {
  const user = requireUserOrLogin(locals);
  return { apiTokens: listApiTokens(user.id) };
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
    const waitMs = signInThrottle.beginAttempt(keys);
    if (waitMs > 0) {
      return rejected("currentPassword", retryMessage(waitMs), 429);
    }
    try {
      await auth.api.changePassword({
        body: { currentPassword, newPassword, revokeOtherSessions: true },
        headers: request.headers,
      });
    } catch (cause) {
      if (!isAuthError(cause, ["INVALID_PASSWORD"])) throw cause;
      return rejected("currentPassword", "That is not your current password.");
    }
    signInThrottle.recordSuccess(keys);
    revokeAllApiTokens(user.id);
    return { changed: true };
  },
  // A token outlives the session, so making one asks for the password, as
  // changing it does.
  createApiToken: async ({ locals, request, getClientAddress }) => {
    const user = requireUserOrLogin(locals);
    const form = await request.formData();
    const keys = attemptKeys(getClientAddress(), user.email);
    const waitMs = signInThrottle.beginAttempt(keys);
    if (waitMs > 0) return fail(429, { message: retryMessage(waitMs) });
    const password = String(form.get("currentPassword") ?? "");
    if (!(await isCurrentPassword(user.id, password))) {
      return fail(400, { message: "That is not your current password." });
    }
    signInThrottle.recordSuccess(keys);
    return runFormAction(() => {
      const input = parseNewApiToken(form);
      return { createdToken: createApiToken(user.id, input), name: input.name };
    });
  },
  revokeApiToken: async ({ locals, request }) => {
    const user = requireUserOrLogin(locals);
    const tokenId = String((await request.formData()).get("tokenId") ?? "");
    return runFormAction(() => {
      if (!isUuid(tokenId)) throw badRequest("Choose a token from the list.");
      revokeApiToken(user.id, tokenId);
    });
  },
};
