<script lang="ts">
  import type { Snippet } from "svelte";
  import { modal } from "$lib/browser/modal";
  import IconButton from "./IconButton.svelte";

  type Props = {
    open?: boolean;
    title: string;
    description?: string;
    children: Snippet;
    actions?: Snippet;
    dismissible?: boolean;
    size?: "md" | "lg";
    onclose?: () => void;
  };

  const SIZE_CLASSES = { md: "max-w-md", lg: "max-w-3xl" };

  let {
    open = $bindable(false),
    title,
    description,
    children,
    actions,
    dismissible = true,
    size = "md",
    onclose,
  }: Props = $props();

  const id = $props.id();
  let returnFocusTo: HTMLElement | null = null;

  // Runs before the modal attachment calls showModal, while focus is still on the opener.
  $effect.pre(() => {
    if (open && document.activeElement instanceof HTMLElement) {
      returnFocusTo = document.activeElement;
    }
  });

  function handleCancel(event: Event) {
    if (!dismissible) event.preventDefault();
  }

  function handleBackdropClick(event: MouseEvent) {
    if (dismissible && event.target === event.currentTarget) open = false;
  }

  function handleClose() {
    open = false;
    onclose?.();
    returnFocusTo?.focus();
    returnFocusTo = null;
  }
</script>

<dialog
  {@attach modal(open)}
  oncancel={handleCancel}
  onclose={handleClose}
  onclick={handleBackdropClick}
  aria-labelledby="{id}-title"
  aria-describedby={description ? `${id}-description` : undefined}
  class={[
    SIZE_CLASSES[size],
    "m-auto w-[calc(100%-2rem)] scale-95 rounded-lg border border-border bg-surface-raised p-0 text-text opacity-0 shadow-xl transition-[opacity,scale] duration-150 backdrop:bg-overlay open:scale-100 open:opacity-100 motion-reduce:transition-none starting:open:scale-95 starting:open:opacity-0",
  ]}
>
  <div class="flex items-start justify-between gap-4 px-5 pt-5">
    <div class="min-w-0">
      <h2 id="{id}-title" class="text-base font-semibold">{title}</h2>
      {#if description}
        <p id="{id}-description" class="mt-1 text-sm text-text-muted">
          {description}
        </p>
      {/if}
    </div>
    <IconButton
      label="Close"
      icon="close"
      size="sm"
      class="-mt-1 -mr-2"
      disabled={!dismissible}
      onclick={() => (open = false)}
    />
  </div>
  <div class="px-5 py-4">{@render children()}</div>
  {#if actions}
    <div class="flex justify-end gap-2 border-t border-border px-5 py-3">
      {@render actions()}
    </div>
  {/if}
</dialog>
