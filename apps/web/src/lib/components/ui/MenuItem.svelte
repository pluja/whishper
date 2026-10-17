<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    onselect?: () => void;
    href?: string;
    disabled?: boolean;
    tone?: "default" | "danger";
    children: Snippet;
  };

  let {
    onselect,
    href,
    disabled = false,
    tone = "default",
    children,
  }: Props = $props();

  const classes = $derived(
    `flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-sm whitespace-nowrap focus:outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus aria-disabled:pointer-events-none aria-disabled:opacity-50 ${
      tone === "danger"
        ? "text-danger hover:bg-danger-soft focus:bg-danger-soft"
        : "text-text hover:bg-surface-sunken focus:bg-surface-sunken"
    }`,
  );

  // Hide before onselect so the menu returns focus to its trigger first; a dialog opened by onselect then restores focus there.
  function select(event: MouseEvent) {
    if (disabled) {
      event.preventDefault();
      return;
    }
    const item = event.currentTarget as HTMLElement;
    item.closest<HTMLElement>("[popover]")?.hidePopover();
    onselect?.();
  }
</script>

{#if href !== undefined}
  <a
    href={disabled ? undefined : href}
    role="menuitem"
    tabindex="-1"
    aria-disabled={disabled || undefined}
    class={classes}
    onclick={select}
  >
    {@render children()}
  </a>
{:else}
  <button
    type="button"
    role="menuitem"
    tabindex="-1"
    aria-disabled={disabled || undefined}
    class={classes}
    onclick={select}
  >
    {@render children()}
  </button>
{/if}
