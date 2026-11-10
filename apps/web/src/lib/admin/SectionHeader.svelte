<script lang="ts">
  type Props = { title: string; description: string };

  let { title, description }: Props = $props();
</script>

<svelte:head>
  <title>{title} · Administration · Anysub</title>
</svelte:head>

<div class="mb-5 max-w-2xl">
  <h2 class="text-lg font-semibold tracking-tight text-text">{title}</h2>
  <p class="mt-1 text-sm text-text-muted">{description}</p>
</div>
