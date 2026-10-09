<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import { isPreparationActive, isRunActive } from "$lib/projectStatus";

  type JobProgress = {
    progress: number | null;
    progress_message: string | null;
    error: Record<string, unknown> | null;
  };

  type Props = {
    run: (JobProgress & { status: string }) | null;
    preparation: (JobProgress & { state: string }) | null;
    mediaPreparationStatus: string;
  };

  let { run, preparation, mediaPreparationStatus }: Props = $props();
</script>

{#if run}
  {#if isRunActive(run)}
    <div class="processing-banner" aria-live="polite">
      <span class="processing-icon"><Icon name="activity" size={18} /></span>
      <div>
        <span class="processing-stage">Transcription</span>
        <strong
          >{run.progress_message ?? "Waiting for a compatible worker"}</strong
        >
        <progress value={run.progress ?? 0} max="1">
          {Math.round((run.progress ?? 0) * 100)}%
        </progress>
      </div>
      <span>{Math.round((run.progress ?? 0) * 100)}%</span>
    </div>
  {:else if run.status === "failed"}
    <div class="alert error" role="alert">
      <strong>Transcription failed</strong>
      <span>{String(run.error?.message ?? "The adapter run failed.")}</span>
    </div>
  {/if}
{/if}

{#if preparation && isPreparationActive(preparation)}
  <div class="processing-banner" aria-live="polite">
    <span class="processing-icon"><Icon name="activity" size={18} /></span>
    <div>
      <span class="processing-stage">Media preparation</span>
      <strong
        >{preparation.progress_message ?? "Waiting for a media worker"}</strong
      >
      <progress value={preparation.progress ?? 0} max="1">
        {Math.round((preparation.progress ?? 0) * 100)}%
      </progress>
    </div>
    <div class="media-preparation-progress-actions">
      <span>{Math.round((preparation.progress ?? 0) * 100)}%</span>
      <form method="POST" action="?/cancelMedia">
        <button type="submit">Cancel</button>
      </form>
    </div>
  </div>
{:else if mediaPreparationStatus === "failed"}
  <div class="alert error media-preparation-error" role="alert">
    <div>
      <strong>Media preparation failed</strong>
      <span
        >{String(
          preparation?.error?.message ??
            "The source could not be prepared for editing.",
        )}</span
      >
    </div>
    <form method="POST" action="?/prepareMedia">
      <button type="submit">Retry preparation</button>
    </form>
  </div>
{/if}
