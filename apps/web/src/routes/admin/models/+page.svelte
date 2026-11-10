<script lang="ts">
  import EmptyState from "$lib/admin/EmptyState.svelte";
  import FormMessage from "$lib/admin/FormMessage.svelte";
  import ModelRow from "$lib/admin/ModelRow.svelte";
  import SectionHeader from "$lib/admin/SectionHeader.svelte";
  import UsageMeter from "$lib/admin/UsageMeter.svelte";
  import { pollWhileActive } from "$lib/browser/polling.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import { pluralize } from "$lib/shared/format";

  const TASK_POLL_MS = 1_500;

  let { data, form } = $props();

  let pickedWorkerId = $state<string>();
  const worker = $derived(
    data.workers.find((candidate) => candidate.workerId === pickedWorkerId) ??
      data.workers[0],
  );
  const downloaded = $derived(
    worker?.models.filter((model) => model.downloaded).length ?? 0,
  );
  const suggestedKey = $derived(
    (
      worker?.models.find((model) => model.recommended) ??
      worker?.models.find((model) => model.modelId === "small")
    )?.key,
  );

  pollWhileActive(
    () =>
      data.workers.some((candidate) =>
        candidate.models.some((model) => model.task),
      ),
    TASK_POLL_MS,
  );
</script>

<SectionHeader
  title="Models"
  description="Whisper models turn speech into text. Download the ones you use so transcriptions start right away and work without an internet connection."
/>

<FormMessage {form} />

{#if !worker}
  <EmptyState icon="server" title="No worker is connected">
    <p>
      Models live on a worker. The worker container starts with Anysub, and its
      models appear here as soon as it connects.
    </p>
    <p>
      If nothing shows up within a minute, read its log with
      <code class="font-mono text-text">docker compose logs worker</code>.
    </p>
  </EmptyState>
{:else}
  {#if data.workers.length > 1}
    <div
      class="mb-4 flex flex-wrap gap-1 rounded-lg bg-surface-sunken p-1"
      role="group"
      aria-label="Worker"
    >
      {#each data.workers as candidate (candidate.workerId)}
        {@const selected = candidate.workerId === worker.workerId}
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none {selected
            ? 'bg-surface text-text shadow-sm'
            : 'text-text-muted hover:text-text'}"
          aria-pressed={selected}
          onclick={() => (pickedWorkerId = candidate.workerId)}
        >
          <Icon name="server" size={16} />
          {candidate.name}
        </button>
      {/each}
    </div>
  {/if}

  <div
    class="mb-4 grid gap-4 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 sm:gap-6 sm:p-5"
  >
    <div class="flex min-w-0 items-start gap-3">
      <span
        class="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent"
        aria-hidden="true"
      >
        <Icon name="cpu" size={18} />
      </span>
      <div class="grid min-w-0 gap-0.5">
        <span class="text-xs text-text-muted">
          {worker.name} · {pluralize(downloaded, "model")} downloaded
        </span>
        <strong class="text-sm font-medium break-words text-text">
          {worker.hardware?.name ?? "Hardware details unavailable"}
        </strong>
        {#if worker.hardware}
          <span class="text-xs break-words text-text-muted">
            {worker.hardware.details.join(" · ")}
          </span>
        {/if}
      </div>
    </div>
    {#if worker.storage}
      <UsageMeter
        label="Model disk"
        usedBytes={worker.storage.totalBytes - worker.storage.availableBytes}
        totalBytes={worker.storage.totalBytes}
      />
    {/if}
  </div>

  {#if !worker.manageable}
    <p
      class="mb-4 flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning"
    >
      <span class="mt-0.5 shrink-0"><Icon name="alert" size={16} /></span>
      {worker.name} runs an older version that cannot download or remove models. Update
      the worker image to manage models here.
    </p>
  {/if}

  <ul
    class="divide-y divide-border rounded-lg border border-border bg-surface"
    aria-label={`Models on ${worker.name}`}
  >
    {#each worker.models as model (model.key)}
      <ModelRow
        {model}
        workerId={worker.workerId}
        workerName={worker.name}
        manageable={worker.manageable}
        availableBytes={worker.storage?.availableBytes ?? null}
        isDefault={model.key === data.defaultModel}
        suggested={model.key === suggestedKey}
      />
    {/each}
  </ul>
  <p class="mt-3 text-xs text-text-muted">
    Models download from Hugging Face. Word alignment also fetches a small model
    the first time it meets a new language. Choose the default model in
    <a
      href="/admin/transcription"
      class="font-medium text-accent underline-offset-2 hover:underline"
      >Transcription</a
    >.
  </p>
{/if}
