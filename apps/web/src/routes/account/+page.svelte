<script lang="ts">
  import ApiTokenSection from "#lib/account/ApiTokenSection.svelte";
  import PasswordSection from "#lib/account/PasswordSection.svelte";

  let { data } = $props();

  const initial = $derived(data.user?.email.slice(0, 1).toUpperCase() ?? "?");
</script>

<svelte:head>
  <title>Account · Anysub</title>
</svelte:head>

<div class="mx-auto grid max-w-2xl gap-6 py-8 sm:py-10">
  <header class="flex items-center gap-3">
    <span
      class="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-base font-semibold text-accent"
      aria-hidden="true"
    >
      {initial}
    </span>
    <div class="min-w-0">
      <h1 class="text-xl font-semibold tracking-tight text-text">Account</h1>
      <p class="truncate text-sm text-text-muted">{data.user?.email}</p>
    </div>
  </header>

  <ApiTokenSection tokens={data.apiTokens} />
  <PasswordSection />
</div>
