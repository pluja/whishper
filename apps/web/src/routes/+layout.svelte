<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import AppTopBar from "$lib/components/AppTopBar.svelte";
  import {
    setThemeController,
    ThemeController,
  } from "$lib/browser/theme.svelte";

  let { data, children } = $props();

  let theme = $state<ThemeController>();
  setThemeController(() => theme);

  onMount(() => {
    const controller = new ThemeController();
    theme = controller;
    return () => controller.dispose();
  });

  const isStudio = $derived(page.route.id?.startsWith("/projects/") ?? false);
</script>

<svelte:head>
  <title>Anysub</title>
  <meta
    name="description"
    content="Private, local transcription and subtitle authoring for creators and teams."
  />
</svelte:head>

{#if data.user && !isStudio}
  <div class="flex min-h-dvh flex-col bg-bg text-text">
    <a
      href="#main"
      class="fixed top-2 left-2 z-50 -translate-y-16 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-fg focus-visible:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      Skip to content
    </a>
    <AppTopBar email={data.user.email} />
    <main
      id="main"
      tabindex="-1"
      class="mx-auto w-full max-w-6xl flex-1 px-4 outline-none sm:px-6"
    >
      {@render children()}
    </main>
  </div>
{:else}
  <main id="main">
    {@render children()}
  </main>
{/if}
