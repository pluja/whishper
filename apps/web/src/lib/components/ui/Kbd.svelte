<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<kbd
  class="inline-flex min-w-5 items-center justify-center rounded border border-border-strong bg-surface-sunken px-1.5 py-0.5 font-mono text-xs text-text-muted"
>
  {@render children()}
</kbd>
