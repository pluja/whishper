<script lang="ts">
  import { enhance } from "$app/forms";
  import { FormSubmission } from "$lib/admin/form-submission.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import { FIT_TONES } from "$lib/components/model-fit";
  import Badge from "$lib/components/ui/Badge.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import IconButton from "$lib/components/ui/IconButton.svelte";
  import Progress from "$lib/components/ui/Progress.svelte";
  import { formatBytes, formatCompactNumber } from "$lib/shared/format";
  import type { InventoryModel } from "$lib/shared/model-inventory";

  type Props = {
    model: InventoryModel;
    workerId: string;
    workerName: string;
    manageable: boolean;
    availableBytes: number | null;
    isDefault: boolean;
    // The model Automatic picks for this worker.
    suggested: boolean;
  };

  let {
    model,
    workerId,
    workerName,
    manageable,
    availableBytes,
    isDefault,
    suggested,
  }: Props = $props();

  const submission = new FormSubmission();

  const size = $derived(model.downloadSizeBytes);
  const task = $derived(model.task);
  const fitsOnDisk = $derived(
    size === null || availableBytes === null || size <= availableBytes,
  );
  const memory = $derived(
    model.memoryRequirementBytes && model.memoryRequirementKind
      ? `~${formatBytes(model.memoryRequirementBytes)} ${model.memoryRequirementKind === "vram" ? "graphics memory" : "memory"}`
      : null,
  );
</script>

{#snippet modelFields()}
  <input type="hidden" name="workerId" value={workerId} />
  <input type="hidden" name="adapterId" value={model.adapterId} />
  <input type="hidden" name="modelId" value={model.modelId} />
{/snippet}

<li
  class="grid gap-4 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_14rem] sm:items-center sm:px-5"
>
  <div class="flex min-w-0 gap-3">
    <span
      class="grid size-9 shrink-0 place-items-center rounded-lg {model.downloaded
        ? 'bg-success-soft text-success'
        : 'bg-surface-sunken text-text-muted'}"
      aria-hidden="true"
    >
      <Icon name="cube" size={18} />
    </span>
    <div class="grid min-w-0 gap-1">
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 class="text-sm font-semibold text-text">{model.displayName}</h3>
        {#if suggested}
          <Badge tone="accent">Recommended</Badge>
        {/if}
        {#if isDefault}
          <Badge tone="neutral">Default</Badge>
        {/if}
      </div>
      {#if model.description}
        <p class="text-sm text-text-muted">{model.description}</p>
      {/if}
      <p
        class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted"
      >
        <span title={model.fitReason}>
          <Badge tone={FIT_TONES[model.fit]}>
            <span class="size-1.5 rounded-full bg-current" aria-hidden="true"
            ></span>
            {model.fitLabel}
          </Badge>
          <span class="sr-only">. {model.fitReason}</span>
        </span>
        {#if memory}<span>{memory}</span>{/if}
        {#if size}<span>{formatBytes(size)} download</span>{/if}
        {#if model.parameterCount}
          <span>{formatCompactNumber(model.parameterCount)} parameters</span>
        {/if}
      </p>
      {#if model.failure && !task}
        <p class="mt-1 flex items-start gap-1.5 text-xs text-danger">
          <span class="mt-px shrink-0"><Icon name="alert" size={14} /></span>
          <span class="min-w-0 break-words">{model.failure}</span>
        </p>
      {/if}
    </div>
  </div>

  <div class="grid min-w-0 gap-1.5 pl-12 sm:justify-items-end sm:pl-0">
    {#if task?.action === "download"}
      <div class="grid w-full gap-1.5">
        <div
          class="flex items-center justify-between gap-2 text-xs text-text-muted"
        >
          <span class="inline-flex min-w-0 items-center gap-1.5">
            <Icon name={task.started ? "download" : "clock"} size={14} />
            <span class="truncate tabular-nums">
              {task.started
                ? `${Math.round(task.progress * 100)}%`
                : `Waiting for ${workerName}`}
            </span>
          </span>
          {#if task.started && size}
            <span class="shrink-0 tabular-nums">
              {formatBytes(size * task.progress)} of {formatBytes(size)}
            </span>
          {/if}
        </div>
        <Progress
          value={task.started ? task.progress : undefined}
          label={`Downloading ${model.displayName}`}
        />
        <form
          method="POST"
          action="?/cancel"
          class="justify-self-end"
          use:enhance={submission.handle()}
        >
          <input type="hidden" name="jobId" value={task.jobId} />
          <Button
            type="submit"
            variant="ghost"
            size="xs"
            loading={submission.busy}
          >
            Cancel
          </Button>
        </form>
      </div>
    {:else if task?.action === "delete"}
      <p
        class="inline-flex items-center gap-2 text-sm text-text-muted"
        role="status"
      >
        <span
          class="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
          aria-hidden="true"
        ></span>
        {task.started ? "Removing" : `Waiting for ${workerName}`}
      </p>
    {:else if model.downloaded}
      <div class="flex items-center gap-1">
        <span
          class="inline-flex items-center gap-1.5 text-sm font-medium text-success"
        >
          <Icon name="check-circle" size={16} />
          Downloaded
        </span>
        {#if manageable}
          <form
            method="POST"
            action="?/remove"
            use:enhance={submission.handle(
              `Remove ${model.displayName} from ${workerName}? Transcriptions that use it will download it again.`,
            )}
          >
            {@render modelFields()}
            <IconButton
              type="submit"
              icon="trash"
              size="sm"
              label={`Remove ${model.displayName}`}
              disabled={submission.busy}
            />
          </form>
        {/if}
      </div>
    {:else}
      <form method="POST" action="?/download" use:enhance={submission.handle()}>
        {@render modelFields()}
        <Button
          type="submit"
          size="sm"
          variant={suggested ? "primary" : "secondary"}
          loading={submission.busy}
          disabled={!manageable || !fitsOnDisk}
        >
          <Icon name={model.failure ? "refresh" : "download"} size={16} />
          {model.failure ? "Try again" : "Download"}
        </Button>
      </form>
      {#if !fitsOnDisk && availableBytes !== null}
        <p class="text-xs text-text-muted sm:text-right">
          Only {formatBytes(availableBytes)} free on the model disk
        </p>
      {/if}
    {/if}
  </div>
</li>
