<script lang="ts">
  import { enhance } from "$app/forms";
  import Icon from "#lib/components/Icon.svelte";
  import Badge from "#lib/components/ui/Badge.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import Progress from "#lib/components/ui/Progress.svelte";
  import type { BadgeTone } from "#lib/components/ui/variants.ts";
  import { formatBytes, formatRelativeTime } from "#lib/shared/format.ts";
  import { projectPageUrl } from "#lib/shared/routes.ts";
  import type {
    WorkerOverview,
    WorkerState,
  } from "#lib/shared/worker-status.ts";

  const STATES: Record<WorkerState, { label: string; tone: BadgeTone }> = {
    busy: { label: "Working", tone: "accent" },
    idle: { label: "Ready", tone: "success" },
    offline: { label: "Offline", tone: "neutral" },
  };

  type Props = { worker: WorkerOverview; now: Date };

  let { worker, now }: Props = $props();

  const status = $derived(STATES[worker.state]);
  const gpu = $derived(worker.gpus[0]);
  const job = $derived(worker.currentJob);
</script>

{#snippet fact(label: string, value: string, detail?: string)}
  <div class="grid min-w-0 content-start gap-0.5">
    <dt class="text-xs text-text-muted">{label}</dt>
    <dd class="text-sm font-medium break-words text-text">{value}</dd>
    {#if detail}
      <dd class="text-xs text-text-muted tabular-nums">{detail}</dd>
    {/if}
  </div>
{/snippet}

<article
  class="grid gap-4 rounded-lg border border-border bg-surface p-4 sm:p-5 {worker.state ===
  'offline'
    ? 'opacity-80'
    : ''}"
  aria-label={worker.name}
>
  <header class="flex items-start gap-3">
    <span
      class="grid size-10 shrink-0 place-items-center rounded-lg {worker.state ===
      'offline'
        ? 'bg-surface-sunken text-text-muted'
        : 'bg-accent-soft text-accent'}"
      aria-hidden="true"
    >
      <Icon name="server" size={20} />
    </span>
    <div class="grid min-w-0 flex-1 gap-0.5">
      <h3 class="truncate text-base font-semibold text-text">{worker.name}</h3>
      <p class="text-xs text-text-muted">
        Version {worker.version} · {worker.architecture} ·
        {worker.device === "cuda" ? "Graphics card" : "Processor"}
      </p>
    </div>
    <span class="shrink-0">
      <Badge tone={status.tone}>
        <span
          class="size-1.5 rounded-full bg-current {worker.state === 'busy'
            ? 'animate-pulse motion-reduce:animate-none'
            : ''}"
          aria-hidden="true"
        ></span>
        {status.label}
      </Badge>
    </span>
  </header>

  {#if job}
    <div class="grid gap-2 rounded-md bg-surface-sunken px-3 py-2.5">
      <div class="flex items-center justify-between gap-3 text-sm">
        {#if job.projectId}
          <a
            href={projectPageUrl(job.projectId)}
            class="min-w-0 truncate font-medium text-text underline-offset-2 hover:underline"
          >
            {job.title}
          </a>
        {:else}
          <span class="min-w-0 truncate font-medium text-text">
            {job.title}
          </span>
        {/if}
        <span class="shrink-0 text-xs text-text-muted tabular-nums">
          {Math.round(job.progress * 100)}%
        </span>
      </div>
      <Progress value={job.progress} label={job.title} />
      {#if job.message}
        <p class="truncate text-xs text-text-muted">{job.message}</p>
      {/if}
    </div>
  {:else if worker.state === "offline"}
    <p class="text-sm text-text-muted">
      Last seen {formatRelativeTime(worker.lastSeenAt, now)}. A worker that
      stopped for good can be removed from this list.
    </p>
  {/if}

  <dl class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    {@render fact(
      "Processor",
      worker.cpu?.model ?? "Unknown",
      worker.cpu ? `${worker.cpu.cores} logical cores` : undefined,
    )}
    {@render fact(
      "Graphics card",
      gpu?.name ?? "None",
      gpu ? `${formatBytes(gpu.totalMemoryBytes)} memory` : undefined,
    )}
    {@render fact(
      "Memory",
      worker.memory ? `${formatBytes(worker.memory.totalBytes)}` : "Unknown",
      worker.memory
        ? `${formatBytes(worker.memory.availableBytes)} available`
        : undefined,
    )}
    {@render fact(
      "Models",
      `${worker.downloadedModels} of ${worker.offeredModels} downloaded`,
      worker.storage
        ? `${formatBytes(worker.storage.availableBytes)} free on the model disk`
        : undefined,
    )}
  </dl>

  {#if worker.state === "offline"}
    <form
      method="POST"
      action="?/forget"
      class="justify-self-start"
      use:enhance={({ cancel }) => {
        if (
          !window.confirm(
            `Remove ${worker.name} from the list? It reappears if it connects again.`,
          )
        ) {
          cancel();
        }
      }}
    >
      <input type="hidden" name="workerId" value={worker.id} />
      <Button type="submit" variant="ghost" size="sm">
        <Icon name="trash" size={16} />
        Remove from list
      </Button>
    </form>
  {/if}
</article>
