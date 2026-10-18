<script lang="ts">
  import { FLAG_SOURCES } from "./flag-sources";

  type Props = {
    flag: string | null;
    placeholder: string;
  };

  let { flag, placeholder }: Props = $props();

  const source = $derived(flag === null ? undefined : FLAG_SOURCES[flag]);
</script>

{#if source}
  <img
    src={source}
    alt=""
    width="24"
    height="18"
    loading="lazy"
    class="h-4.5 w-6 shrink-0 rounded-xs object-cover ring-1 ring-border"
  />
{:else}
  <span
    class="grid h-4.5 w-6 shrink-0 place-items-center rounded-xs bg-surface-sunken font-mono text-[0.5625rem] leading-none text-text-muted uppercase ring-1 ring-border"
    aria-hidden="true"
  >
    {placeholder}
  </span>
{/if}
