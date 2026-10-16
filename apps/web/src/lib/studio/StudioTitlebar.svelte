<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import type { Autosave } from "$lib/editor/autosave.svelte";
  import { formatBytes } from "$lib/shared/format";

  type Props = {
    project: {
      id: string;
      name: string;
      mediaFilename: string | null;
      workspaceName: string;
      sizeBytes: number | null;
      mediaFrameRateNum: number | null;
      mediaFrameRateDen: number | null;
      mediaPreparationStatus: string;
      canManage: boolean;
    };
    track: { id: string; language: string } | null;
    derivativeKinds: string[];
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
      <span>{track.language.toUpperCase()} · {cueCount} cues</span>
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
          <a
            href={`/api/projects/${project.id}/tracks/${track.id}/export/srt`}
            download
          >
            <strong>SRT</strong><span>Universal subtitle file</span>
          </a>
          <a
            href={`/api/projects/${project.id}/tracks/${track.id}/export/vtt`}
            download
          >
            <strong>WebVTT</strong><span>Web video captions</span>
          </a>
          <a
            href={`/api/projects/${project.id}/tracks/${track.id}/export/json`}
            download
          >
            <strong>Anysub JSON</strong><span>Cues, words, and metadata</span>
          </a>
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
              onsubmit={(event) => {
                if (
                  !confirm(
                    "Delete this transcript, its cues, and processing record? The source media will remain.",
                  )
                )
                  event.preventDefault();
              }}
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
              onsubmit={(event) => {
                if (
                  !confirm(
                    `Delete the ${kind} derivative? The source media will remain.`,
                  )
                )
                  event.preventDefault();
              }}
            >
              <input type="hidden" name="kind" value={kind} />
              <button type="submit">Delete {kind} derivative</button>
            </form>
          {/each}
          <form
            method="POST"
            action="?/deleteProject"
            onsubmit={(event) => {
              if (
                !confirm(
                  "Delete this project, its source media, and every transcript? This cannot be undone.",
                )
              )
                event.preventDefault();
            }}
          >
            <button type="submit">Delete project</button>
          </form>
        </div>
      </details>
    {/if}
  </div>
</header>
