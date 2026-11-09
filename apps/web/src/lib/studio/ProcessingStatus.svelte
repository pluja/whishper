<script lang="ts">
  import Button from "$lib/components/ui/Button.svelte";
  import Progress from "$lib/components/ui/Progress.svelte";
  import { isPreparationActive, isRunActive } from "$lib/shared/project-status";
  import type { StudioData } from "$lib/shared/studio-data";

  type Props = {
    run: StudioData["run"];
    preparation: StudioData["preparation"];
    mediaPreparationStatus: StudioData["project"]["mediaPreparationStatus"];
  };

  let { run, preparation, mediaPreparationStatus }: Props = $props();
</script>

{#snippet activeJob(
  stage: string,
  message: string,
  progress: number | null,
  cancelAction?: string,
)}
  <div class="grid gap-2 border-b border-border px-4 py-3" aria-live="polite">
    <div class="flex items-center justify-between gap-3">
      <div class="min-w-0">
        <p class="text-xs font-medium text-accent">{stage}</p>
        <p class="truncate text-sm text-text">{message}</p>
      </div>
      <span class="font-mono text-xs text-text-muted tabular-nums">
        {Math.round((progress ?? 0) * 100)}%
      </span>
      {#if cancelAction}
        <form method="POST" action={cancelAction}>
          <Button type="submit" size="sm" variant="ghost">Cancel</Button>
        </form>
      {/if}
    </div>
    <Progress value={progress ?? 0} label={`${stage} progress`} />
  </div>
{/snippet}

{#snippet failure(title: string, message: string, retryAction?: string)}
  <div
    class="flex items-start justify-between gap-3 border-b border-border bg-danger-soft px-4 py-3 text-danger"
    role="alert"
  >
    <div class="min-w-0 text-sm">
      <p class="font-medium">{title}</p>
      <p>{message}</p>
    </div>
    {#if retryAction}
      <form method="POST" action={retryAction}>
        <Button type="submit" size="sm">Retry preparation</Button>
      </form>
    {/if}
  </div>
{/snippet}

{#if run && isRunActive(run)}
  {@render activeJob(
    "Transcription",
    run.progressMessage ?? "Waiting for a compatible worker",
    run.progress,
    "?/cancelTranscription",
  )}
{:else if run?.status === "failed"}
  {@render failure(
    "Transcription failed",
    String(run.error?.message ?? "The adapter run failed."),
  )}
{/if}

{#if preparation && isPreparationActive(preparation)}
  {@render activeJob(
    "Media preparation",
    preparation.progressMessage ?? "Waiting for a media worker",
    preparation.progress,
    "?/cancelMedia",
  )}
{:else if mediaPreparationStatus === "failed"}
  {@render failure(
    "Media preparation failed",
    String(
      preparation?.error?.message ??
        "The source could not be prepared for editing.",
    ),
    "?/prepareMedia",
  )}
{/if}
