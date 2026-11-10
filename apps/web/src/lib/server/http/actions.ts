import { fail, type ActionFailure } from "@sveltejs/kit";

import { clientFailure } from "$lib/server/http/errors";

export type ActionMessage = { message: string };

// Known client failures become an inline message on the form. Anything else
// reaches the handleError hook, which logs it and answers generically.
export function runFormAction(
  work: () => void,
): ActionFailure<ActionMessage> | { done: true } {
  try {
    work();
  } catch (cause) {
    const failure = clientFailure(cause);
    if (!failure) throw cause;
    return fail(failure.status, { message: failure.message });
  }
  return { done: true };
}
