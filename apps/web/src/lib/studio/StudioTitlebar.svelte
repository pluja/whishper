<script module lang="ts">
  import type { TrackExportFormat } from "$lib/shared/routes";

  const EXPORTS: {
    format: TrackExportFormat;
    name: string;
    description: string;
  }[] = [
    { format: "srt", name: "SRT", description: "Universal subtitle file" },
    { format: "vtt", name: "WebVTT", description: "Web video captions" },
    {
      format: "json",
      name: "Anysub JSON",
      description: "Cues, words, and metadata",
    },
  ];
</script>

<script lang="ts">
  import type { MediaDerivativeKind } from "@anysub/contracts";
  import Icon from "$lib/components/Icon.svelte";
  import { confirmSubmit } from "$lib/browser/confirm-submit";
  import type { Autosave } from "$lib/editor/autosave.svelte";
  import { formatBytes, pluralize } from "$lib/shared/format";
  import { trackExportUrl } from "$lib/shared/routes";
  import type { StudioData } from "$lib/shared/studio-data";

  type Props = {
    project: StudioData["project"];
    track: StudioData["track"];
    derivativeKinds: MediaDerivativeKind[];
    cueCount: number;
    autosave: Autosave;
    onopenshortcuts: () => void;
  };

  let {
    project,
    track,
    derivativeKinds,
    cueCount,
    autosave,
    onopenshortcuts,
  }: Props = $props();
</script>

<header class="studio-titlebar">
  <a class="studio-back" href="/" aria-label="Back to projects">
    <Icon name="arrow-left" size={17} />
  </a>
  <div class="studio-identity">
    <strong>{project.name}</strong>
    <span>{project.mediaFilename ?? "Worker diagnostic"}</span>
  </div>
  <div class="studio-context">
    <span>{project.workspaceName}</span>
    {#if project.sizeBytes}
      <span>{formatBytes(project.sizeBytes)}</span>
    {/if}
    {#if track}
      <span>{track.language.toUpperCase()} · {pluralize(cueCount, "cue")}</span>
    {/if}
    {#if project.mediaFrameRateNum && project.mediaFrameRateDen}
      <span
        >{(project.mediaFrameRateNum / project.mediaFrameRateDen).toFixed(3)} fps</span
      >
    {/if}
  </div>
  <div class="studio-actions">
    <button
      class="shortcut-guide-button"
      type="button"
      aria-label="Keyboard shortcuts"
      title="Keyboard shortcuts"
      onclick={onopenshortcuts}
    >
      <span aria-hidden="true">?</span><span>Shortcuts</span>
    </button>
    {#if track}
      <span class="save-state" data-state={autosave.state} aria-live="polite">
        <span></span>{autosave.label}
      </span>
      <details class="export-menu studio-export">
        <summary><Icon name="download" size={15} /> Export</summary>
        <div>
          {#each EXPORTS as { format, name, description } (format)}
            <a href={trackExportUrl(project.id, track.id, format)} download>
              <strong>{name}</strong><span>{description}</span>
            </a>
          {/each}
        </div>
      </details>
    {/if}
    {#if project.canManage}
      <details class="project-menu">
        <summary aria-label="Project actions" title="Project actions">
          <Icon name="more" size={18} />
        </summary>
        <div>
          {#if track}
            <form
              method="POST"
              action="?/deleteTranscript"
              onsubmit={confirmSubmit(
                "Delete this transcript, its cues, and processing record? The source media will remain.",
              )}
            >
              <input type="hidden" name="trackId" value={track.id} />
              <button type="submit">Delete transcript</button>
            </form>
          {/if}
          <form class="media-action" method="POST" action="?/prepareMedia">
            <button type="submit">
              {project.mediaPreparationStatus === "completed"
                ? "Regenerate media derivatives"
                : "Prepare media"}
            </button>
          </form>
          {#each derivativeKinds as kind (kind)}
            <form
              method="POST"
              action="?/deleteDerivative"
              onsubmit={confirmSubmit(
                `Delete the ${kind} derivative? The source media will remain.`,
              )}
            >
              <input type="hidden" name="kind" value={kind} />
              <button type="submit">Delete {kind} derivative</button>
            </form>
          {/each}
          <form
            method="POST"
            action="?/deleteProject"
            onsubmit={confirmSubmit(
              "Delete this project, its source media, and every transcript? This cannot be undone.",
            )}
          >
            <button type="submit">Delete project</button>
          </form>
        </div>
      </details>
    {/if}
  </div>
</header>
