<script lang="ts">
  import type { Snippet } from "svelte";
  import type {
    HTMLAnchorAttributes,
    HTMLButtonAttributes,
  } from "svelte/elements";
  import {
    buttonClasses,
    type ButtonSize,
    type ButtonVariant,
  } from "./variants";

  type Common = {
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
    children: Snippet;
  };
  type Props =
    | (Common & HTMLButtonAttributes & { href?: undefined })
    | (Common & HTMLAnchorAttributes & { href: string });

  let {
    variant = "secondary",
    size = "md",
    loading = false,
    class: extra = "",
    children,
    ...rest
  }: Props = $props();

  const classes = $derived(`${buttonClasses(variant, size)} ${extra}`);
</script>

{#if rest.href !== undefined}
  <a {...rest} class={classes}>{@render children()}</a>
{:else}
  <button
    type="button"
    {...rest}
    class={classes}
    disabled={rest.disabled || loading}
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
