import {
  fail,
  isHttpError,
  isRedirect,
  type ActionFailure,
} from "@sveltejs/kit";

import { clientFailure } from "#lib/server/http/errors.ts";

export type ActionMessage = { message: string };

// Known client failures become an inline message on the form. Anything else
// reaches the handleError hook, which logs it and answers generically, unless
// the form names a fallback message: then the cause is logged here and the
// form shows the fallback.
export async function runFormAction<Result>(
  work: () => Result | Promise<Result>,
  fallbackMessage?: string,
): Promise<Result | ActionFailure<ActionMessage>> {
  try {
    return await work();
  } catch (cause) {
    if (isHttpError(cause) || isRedirect(cause)) throw cause;
    const failure = clientFailure(cause);
    if (failure) return fail(failure.status, { message: failure.message });
    if (fallbackMessage === undefined) throw cause;
    console.error(fallbackMessage, cause);
    return fail(500, { message: fallbackMessage });
  }
}
