<script lang="ts">
  import type { Snippet } from "svelte";
  import Icon from "$lib/components/Icon.svelte";
  import type { IconName } from "$lib/components/icon-names";

  type Props = { icon: IconName; title: string; children: Snippet };

  let { icon, title, children }: Props = $props();
</script>

<div
  class="grid justify-items-center gap-3 rounded-lg border border-dashed border-border-strong bg-surface px-6 py-12 text-center"
>
  <span
    class="grid size-11 place-items-center rounded-full bg-surface-sunken text-text-muted"
    aria-hidden="true"
  >
    <Icon name={icon} size={22} />
  </span>
  <h3 class="text-base font-semibold text-text">{title}</h3>
  <div class="grid max-w-md gap-2 text-sm text-text-muted">
    {@render children()}
  </div>
</div>
