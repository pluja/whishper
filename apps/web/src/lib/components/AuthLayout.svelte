<script lang="ts">
  import type { Snippet } from "svelte";
  import Icon from "./Icon.svelte";

  type Props = {
    title: string;
    description?: string;
    children: Snippet;
  };

  let { title, description, children }: Props = $props();
</script>

<div class="grid min-h-dvh place-items-center bg-bg p-4 text-text">
  <section
    class="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-sm"
    aria-labelledby="auth-title"
  >
    <div class="flex items-center gap-2 text-sm font-semibold tracking-tight">
      <span class="text-accent"><Icon name="subtitles" size={20} /></span>
      Anysub
    </div>
    <h1 id="auth-title" class="mt-6 text-xl font-semibold tracking-tight">
      {title}
    </h1>
    {#if description}
      <p class="mt-1.5 text-sm text-text-muted">{description}</p>
    {/if}
    <div class="mt-6">
      {@render children()}
    </div>
  </section>
</div>
