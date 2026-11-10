<script lang="ts">
  import EmptyState from "$lib/admin/EmptyState.svelte";
  import FormMessage from "$lib/admin/FormMessage.svelte";
  import SectionHeader from "$lib/admin/SectionHeader.svelte";
  import WorkerCard from "$lib/admin/WorkerCard.svelte";
  import { pollWhileActive } from "$lib/browser/polling.svelte";

  // Fast enough to show a worker connecting or finishing a job.
  const REFRESH_MS = 5_000;

  let { data, form } = $props();

  // Read again on every refresh, so "last seen" stays current.
  const now = $derived.by(() => {
    void data.workers;
    return new Date();
  });

  pollWhileActive(() => true, REFRESH_MS);
</script>

<SectionHeader
  title="Workers"
  description="Workers run transcriptions and prepare media. Each one reports its hardware, what it is doing and the models it has downloaded."
/>

<FormMessage {form} />

{#if data.workers.length}
  <div class="grid gap-4">
    {#each data.workers as worker (worker.id)}
      <WorkerCard {worker} {now} />
    {/each}
  </div>
{:else}
  <EmptyState icon="server" title="No worker has connected yet">
    <p>
      The worker container starts with Anysub and connects on its own, usually
      within a minute.
    </p>
    <p>
      If it does not appear, read its log with
      <code class="font-mono text-text">docker compose logs worker</code>.
    </p>
  </EmptyState>
{/if}
