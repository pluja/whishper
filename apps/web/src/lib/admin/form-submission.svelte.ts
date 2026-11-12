import type { SubmitFunction } from "$app/forms";

export class FormSubmission {
  busy = $state(false);

  // Keeps the typed values after the update, so a rejected form can be fixed
  // in place.
  handle(confirmation?: string): SubmitFunction {
    return ({ cancel }) => {
      if (confirmation && !window.confirm(confirmation)) {
        cancel();
        return;
      }
      this.busy = true;
      return async ({ update }) => {
        try {
          await update({ reset: false });
        } finally {
          this.busy = false;
        }
      };
    };
  }
}
