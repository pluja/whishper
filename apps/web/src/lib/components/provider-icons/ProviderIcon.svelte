<script lang="ts">
  import {
    hasProviderIcon,
    type ProviderBrand,
  } from "#lib/shared/provider-brands.ts";
  import { PROVIDER_ICONS } from "./paths";

  type Props = {
    name: string;
    brand: ProviderBrand | null;
    size?: number;
  };

  let { name, brand, size = 16 }: Props = $props();

  const monogram = $derived(name.trim().charAt(0).toUpperCase() || "?");
</script>

{#if hasProviderIcon(brand)}
  <svg
    width={size}
    height={size}
    viewBox={PROVIDER_ICONS[brand].viewBox}
    fill="currentColor"
    fill-rule="evenodd"
    clip-rule="evenodd"
    aria-hidden="true"
    class="shrink-0"
  >
    {#each PROVIDER_ICONS[brand].paths as path, index (index)}
      <path d={path} />
    {/each}
  </svg>
{:else}
  <span
    class="grid shrink-0 place-items-center rounded-[25%] border border-current leading-none font-semibold"
    style:width="{size}px"
    style:height="{size}px"
    style:font-size="{Math.round(size * 0.6)}px"
    aria-hidden="true"
  >
    {monogram}
  </span>
{/if}
