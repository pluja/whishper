<script module lang="ts">
  import type { IconName } from "#lib/components/icon-names.ts";
  import type { Autosave } from "#lib/editor/autosave.svelte.ts";
  import type { TrackExportFormat } from "#lib/shared/routes.ts";

  const EXPORTS: {
    format: TrackExportFormat;
    name: string;
    description: string;
  }[] = [
    { format: "srt", name: "SRT", description: "Universal subtitle file" },
    { format: "vtt", name: "WebVTT", description: "Web video captions" },
    {
      format: "txt",
      name: "Plain text",
      description: "Transcript without timecodes",
    },
    {
      format: "json",
      name: "Anysub JSON",
      description: "Cues, words, and metadata",
    },
  ];

  const SAVE_ICONS: Record<Exclude<Autosave["state"], "saving">, IconName> = {
    saved: "check",
    unsaved: "edit",
    error: "alert",
    conflict: "alert",
  };
</script>

<script lang="ts">
  import type { MediaDerivativeKind } from "@anysub/contracts";
  import Icon from "#lib/components/Icon.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import IconButton from "#lib/components/ui/IconButton.svelte";
  import Menu from "#lib/components/ui/Menu.svelte";
  import MenuItem from "#lib/components/ui/MenuItem.svelte";
  import { buttonClasses } from "#lib/components/ui/variants.ts";
  import { confirmSubmit } from "#lib/browser/confirm-submit.ts";
  import { formatBytes } from "#lib/shared/format.ts";
  import { trackExportUrl } from "#lib/shared/routes.ts";
  import type { StudioData } from "#lib/shared/studio-data.ts";

  type Props = {
    project: StudioData["project"];
    track: StudioData["track"];
    derivativeKinds: MediaDerivativeKind[];
    autosave: Autosave;
    canRetranscribe: boolean;
    onretranscribe: () => void;
    onopenshortcuts: () => void;
  };

  let {
    project,
    track,
    derivativeKinds,
    autosave,
    canRetranscribe,
    onretranscribe,
    onopenshortcuts,
  }: Props = $props();

  const id = $props.id();
  const formIds = {
    deleteTranscript: `${id}-delete-transcript`,
    prepareMedia: `${id}-prepare-media`,
    deleteProject: `${id}-delete-project`,
    deleteDerivative: (kind: MediaDerivativeKind) =>
      `${id}-delete-derivative-${kind}`,
  };

  const mediaDetails = $derived(
    [
      project.mediaFilename ?? "Worker diagnostic",
      project.sizeBytes ? formatBytes(project.sizeBytes) : null,
      project.mediaFrameRateNum && project.mediaFrameRateDen
        ? `${(project.mediaFrameRateNum / project.mediaFrameRateDen).toFixed(3)} fps`
        : null,
    ]
      .filter(Boolean)
      .join(" · "),
  );
  const saveProblem = $derived(
    autosave.state === "error" || autosave.state === "conflict",
  );
</script>

<header
  class="grid h-12 shrink-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 border-b border-border bg-surface px-2 sm:grid-cols-[1fr_auto_1fr] sm:gap-3"
>
  <div class="flex min-w-0 items-center gap-1.5 overflow-hidden">
    <a
      href="/"
      class="{buttonClasses('ghost', 'md', true)} shrink-0"
      aria-label="Back to projects"
      title="Back to projects"
    >
      <Icon name="arrow-left" size={18} />
    </a>
    <div class="min-w-0 leading-tight">
      <h1 class="truncate text-sm font-semibold text-text" title={project.name}>
        {project.name}
      </h1>
      <p class="truncate text-xs text-text-muted max-sm:hidden">
        {mediaDetails}
      </p>
    </div>
  </div>

  <div class="flex justify-center">
    {#if track}
      <span
        class="inline-flex items-center gap-1.5 text-xs {saveProblem
          ? 'text-danger'
          : 'text-text-muted'}"
      >
        {#if autosave.state === "saving"}
          <span
            class="size-3 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
            aria-hidden="true"
          ></span>
        {:else}
          <Icon name={SAVE_ICONS[autosave.state]} size={14} />
        {/if}
        <span class="max-sm:sr-only">{autosave.label}</span>
      </span>
    {/if}
  </div>

  <div class="flex items-center justify-end gap-1">
    {#if canRetranscribe}
      <Button size="sm" class="max-sm:px-2" onclick={onretranscribe}>
        <Icon name="refresh" size={16} />
        <span class="max-sm:sr-only">Re-transcribe</span>
      </Button>
    {/if}
    {#if track}
      <Menu label="Export" align="end">
        {#snippet trigger(args)}
          <button
            type="button"
            {...args}
            class={buttonClasses("ghost", "sm")}
            aria-label="Export"
          >
            <Icon name="download" size={16} />
            <span class="max-sm:hidden">Export</span>
          </button>
        {/snippet}
        {#each EXPORTS as { format, name, description } (format)}
          <MenuItem
            href={trackExportUrl(project.id, track.id, format)}
            download
          >
            <span class="grid">
              <span class="font-medium">{name}</span>
              <span class="text-xs text-text-muted">{description}</span>
            </span>
          </MenuItem>
        {/each}
      </Menu>
    {/if}
    <IconButton
      label="Keyboard shortcuts"
      icon="keyboard"
      onclick={onopenshortcuts}
    />
    {#if project.canManage}
      <Menu label="Project actions" align="end">
        {#snippet trigger(args)}
          <IconButton label="Project actions" icon="more" {...args} />
        {/snippet}
        <MenuItem form={formIds.prepareMedia}>
          {project.mediaPreparationStatus === "completed"
            ? "Regenerate media derivatives"
            : "Prepare media"}
        </MenuItem>
        <div role="separator" class="-mx-1 my-1 border-t border-border"></div>
        {#each derivativeKinds as kind (kind)}
          <MenuItem form={formIds.deleteDerivative(kind)} tone="danger">
            Delete {kind} derivative
          </MenuItem>
        {/each}
        {#if track}
          <MenuItem form={formIds.deleteTranscript} tone="danger">
            Delete transcript
          </MenuItem>
        {/if}
        <MenuItem form={formIds.deleteProject} tone="danger">
          Delete project
        </MenuItem>
      </Menu>
    {/if}
  </div>
</header>

{#if project.canManage}
  <form
    id={formIds.prepareMedia}
    method="POST"
    action="?/prepareMedia"
    hidden
  ></form>
  {#each derivativeKinds as kind (kind)}
    <form
      id={formIds.deleteDerivative(kind)}
      method="POST"
      action="?/deleteDerivative"
      onsubmit={confirmSubmit(
        `Delete the ${kind} derivative? The source media will remain.`,
      )}
      hidden
    >
      <input type="hidden" name="kind" value={kind} />
    </form>
  {/each}
  {#if track}
    <form
      id={formIds.deleteTranscript}
      method="POST"
      action="?/deleteTranscript"
      onsubmit={confirmSubmit(
        "Delete this transcript, its cues, and processing record? The source media will remain.",
      )}
      hidden
    >
      <input type="hidden" name="trackId" value={track.id} />
    </form>
  {/if}
  <form
    id={formIds.deleteProject}
    method="POST"
    action="?/deleteProject"
    onsubmit={confirmSubmit(
      "Delete this project, its source media, and every transcript? This cannot be undone.",
    )}
    hidden
  ></form>
{/if}
