<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = { title: string; description: string; actions?: Snippet };

  let { title, description, actions }: Props = $props();
</script>

<svelte:head>
  <title>{title} · Administration · Anysub</title>
</svelte:head>

<div class="mb-5 flex flex-wrap items-end justify-between gap-3">
  <div class="min-w-0 max-w-2xl">
    <h2 class="text-lg font-semibold tracking-tight text-text">{title}</h2>
    <p class="mt-1 text-sm text-text-muted">{description}</p>
  </div>
  {@render actions?.()}
</div>
