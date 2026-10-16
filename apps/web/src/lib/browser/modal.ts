import type { Attachment } from "svelte/attachments";

export function modal(open: boolean): Attachment<HTMLDialogElement> {
  return (dialog) => {
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  };
}
