<script lang="ts">
  import type { Snippet } from "svelte";
  import Icon from "#lib/components/Icon.svelte";
  import type { IconName } from "#lib/components/icon-names.ts";

  type Props = {
    icon: IconName;
    title: string;
    description?: string;
    children: Snippet;
  };

  let { icon, title, description, children }: Props = $props();

  const id = $props.id();
</script>

<section
  class="grid gap-4 rounded-lg border border-border bg-surface p-4 sm:grid-cols-[2.25rem_minmax(0,1fr)] sm:p-5"
  aria-labelledby="{id}-title"
>
  <span
    class="hidden size-9 place-items-center rounded-lg bg-surface-sunken text-text-muted sm:grid"
    aria-hidden="true"
  >
    <Icon name={icon} size={18} />
  </span>
  <div class="grid min-w-0 gap-4">
    <div>
      <h3 id="{id}-title" class="text-base font-semibold text-text">
        {title}
      </h3>
      {#if description}
        <p class="mt-1 text-sm text-text-muted">{description}</p>
      {/if}
    </div>
    {@render children()}
  </div>
</section>
