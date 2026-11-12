import type { SubmitFunction } from "$app/forms";

type SubmissionOptions = {
  // Asked before submitting; declining cancels the submission.
  confirm?: string;
  onsuccess?: (data: Record<string, unknown> | undefined) => void;
  // Takes a rejected form's message instead of the page-level message, so it
  // can show next to the form that caused it.
  onfailure?: (message: string) => void;
};

export class FormSubmission {
  busy = $state(false);

  // Keeps the typed values after the update, so a rejected form can be fixed
  // in place.
  handle({
    confirm,
    onsuccess,
    onfailure,
  }: SubmissionOptions = {}): SubmitFunction {
    return ({ cancel }) => {
      if (confirm && !window.confirm(confirm)) {
        cancel();
        return;
      }
      this.busy = true;
      return async ({ result, update }) => {
        try {
          if (result.type === "failure" && onfailure) {
            onfailure(String(result.data?.message ?? "That did not work."));
            return;
          }
          await update({ reset: false });
          if (result.type === "success") onsuccess?.(result.data);
        } finally {
          this.busy = false;
        }
      };
    };
  }
}
