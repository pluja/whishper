<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import IconButton from "$lib/components/ui/IconButton.svelte";
  import type { Autosave } from "$lib/editor/autosave.svelte";

  let { autosave }: { autosave: Autosave } = $props();
</script>

<!-- The live region stays mounted so screen readers announce a notice when it appears. -->
<div role="status" class="shrink-0">
  {#if autosave.notice}
    <div
      class="flex items-start gap-2 border-b border-border bg-warning-soft py-1.5 pr-2 pl-4 text-sm text-text"
    >
      <span class="mt-1.5 shrink-0 text-warning" aria-hidden="true">
        <Icon name="alert" size={16} />
      </span>
      <p class="min-w-0 flex-1 py-1">{autosave.notice}</p>
      <IconButton
        label="Dismiss notice"
        icon="close"
        size="sm"
        onclick={() => autosave.dismissNotice()}
      />
    </div>
  {/if}
</div>
