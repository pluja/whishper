<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";
  import {
    buttonClasses,
    type ButtonSize,
    type ButtonVariant,
  } from "./variants";

  type Props = HTMLButtonAttributes & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    href?: string;
    loading?: boolean;
    children: Snippet;
  };

  let {
    variant = "secondary",
    size = "md",
    href,
    loading = false,
    disabled,
    class: extra = "",
    children,
    ...rest
  }: Props = $props();

  const classes = $derived(`${buttonClasses(variant, size)} ${extra}`);
</script>

{#if href}
  <a {href} class={classes}>{@render children()}</a>
{:else}
  <button
    type="button"
    {...rest}
    class={classes}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
  >
    {#if loading}
      <span
        class="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
        aria-hidden="true"
      ></span>
    {/if}
    {@render children()}
  </button>
{/if}
