<script lang="ts">
  import type { Snippet } from "svelte";
  import Icon from "../Icon.svelte";

  type Props = {
    onselect?: () => void;
    href?: string;
    download?: boolean;
    disabled?: boolean;
    tone?: "default" | "danger";
    role?: "menuitem" | "menuitemradio";
    checked?: boolean;
    form?: string;
    children: Snippet;
  };

  let {
    onselect,
    href,
    download = false,
    disabled = false,
    tone = "default",
    role = "menuitem",
    checked = false,
    form,
    children,
  }: Props = $props();

  const classes = $derived(
    `flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-sm whitespace-nowrap focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus aria-disabled:pointer-events-none aria-disabled:opacity-50 ${
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

{#snippet content()}
  {#if role === "menuitemradio"}
    <span class="size-4 shrink-0">
      {#if checked}<Icon name="check" size={16} />{/if}
    </span>
  {/if}
  {@render children()}
{/snippet}

{#if href !== undefined}
  <a
    href={disabled ? undefined : href}
    download={download || undefined}
    {role}
    tabindex="-1"
    aria-checked={role === "menuitemradio" ? checked : undefined}
    aria-disabled={disabled || undefined}
    class={classes}
    onclick={select}
  >
    {@render content()}
  </a>
{:else}
  <button
    type={form ? "submit" : "button"}
    {form}
    {role}
    tabindex="-1"
    aria-checked={role === "menuitemradio" ? checked : undefined}
    aria-disabled={disabled || undefined}
    class={classes}
    onclick={select}
  >
    {@render content()}
  </button>
{/if}
