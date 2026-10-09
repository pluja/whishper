<script lang="ts">
  import { enhance } from "$app/forms";
  import Icon from "$lib/components/Icon.svelte";
  import { formatBytes, formatDuration } from "$lib/format";
  import {
    displayState,
    mediaPlaceholder,
    projectSourceFallback,
    stateLabel,
  } from "$lib/projectStatus";
  import type { SubmitFunction } from "@sveltejs/kit";
  import type { PageData } from "../../../routes/$types";

  type RenameForm = { renameProjectId?: string; renameError?: string } | null;

  let {
    project,
    eagerThumbnail,
    renameAction,
    form,
  }: {
    project: PageData["projects"][number];
    eagerThumbnail: boolean;
    renameAction: string;
    form: RenameForm;
  } = $props();

  // svelte-ignore state_referenced_locally
  let editing = $state(form?.renameProjectId === project.id);
  // svelte-ignore state_referenced_locally
  let renameDraft = $state(project.name);
  let renameSaving = $state(false);
  let projectState = $derived(displayState(project));
  let dimensions = $derived(
    formatDimensions(project.video_width, project.video_height),
  );
  let renameError = $derived(
    form?.renameProjectId === project.id ? (form.renameError ?? "") : "",
  );

  const languageNames = new Intl.DisplayNames(undefined, { type: "language" });
  const activityDateTime = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  function formatDimensions(
    width: string | null,
    height: string | null,
  ): string | null {
    const numericWidth = Number(width);
    const numericHeight = Number(height);
    if (
      !Number.isInteger(numericWidth) ||
      !Number.isInteger(numericHeight) ||
      numericWidth <= 0 ||
      numericHeight <= 0
    ) {
      return null;
    }
    return `${numericWidth}×${numericHeight}`;
  }

  function formatLanguages(languages: string[]): string {
    return languages
      .map((language) => {
        try {
          return languageNames.of(language) ?? language;
        } catch {
          return language;
        }
      })
      .join(", ");
  }

  function formatSubtitleCounts(trackCount: number, cueCount: number): string {
    const tracks = `${trackCount} ${trackCount === 1 ? "track" : "tracks"}`;
    const cues = `${cueCount} ${cueCount === 1 ? "cue" : "cues"}`;
    return `${tracks} · ${cues}`;
  }

  function activityDate(value: Date | string): Date {
    return value instanceof Date ? value : new Date(value);
  }

  function beginRename() {
    renameDraft = project.name;
    editing = true;
  }

  function focusAndSelect(input: HTMLInputElement) {
    input.focus();
    input.select();
  }

  function cancelRename() {
    editing = false;
  }

  function handleRenameKeydown(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    cancelRename();
  }

  const enhanceRename: SubmitFunction = () => {
    renameSaving = true;
    return async ({ result, update }) => {
      renameSaving = false;
      if (result.type === "failure") editing = true;
      else if (result.type === "success" || result.type === "redirect") {
        editing = false;
      }
      await update({ reset: false });
    };
  };
</script>

<article class="project-entry">
  <div class="project-main">
    <a
      class="project-thumbnail-link"
      href={`/projects/${project.id}`}
      aria-label={`Open ${project.name}`}
    >
      <div class="project-thumbnail">
        {#if project.has_thumbnail}
          <img
            src={`/api/projects/${project.id}/derivatives/thumbnail`}
            alt=""
            width="640"
            height="360"
            loading={eagerThumbnail ? "eager" : "lazy"}
            fetchpriority={eagerThumbnail ? "high" : "auto"}
          />
        {:else}
          {@const placeholder = mediaPlaceholder(project)}
          <div class="project-thumbnail-placeholder">
            <Icon name={placeholder.icon} size={28} />
            <span class="visually-hidden">{placeholder.label}</span>
          </div>
        {/if}
      </div>
    </a>

    <div class="project-details">
      <div class="project-title-row">
        {#if editing}
          <form
            class="project-title-edit"
            method="POST"
            action={renameAction}
            use:enhance={enhanceRename}
          >
            <input type="hidden" name="projectId" value={project.id} />
            <label for={`project-title-${project.id}`}>
              <span class="visually-hidden">Title</span>
              <input
                {@attach focusAndSelect}
                id={`project-title-${project.id}`}
                name="name"
                bind:value={renameDraft}
                required
                maxlength="160"
                onkeydown={handleRenameKeydown}
                aria-invalid={renameError !== ""}
                aria-describedby={`rename-error-${project.id}`}
              />
            </label>
            <button
              class="project-title-action"
              type="submit"
              disabled={renameSaving}
              aria-label={renameSaving ? "Saving title" : "Save title"}
              title={renameSaving ? "Saving title" : "Save title"}
            >
              <Icon name="check" size={15} />
            </button>
            <button
              class="project-title-action"
              type="button"
              aria-label="Cancel renaming"
              title="Cancel renaming"
              onclick={cancelRename}
            >
              <Icon name="close" size={15} />
            </button>
            <p
              class="rename-error"
              id={`rename-error-${project.id}`}
              role={renameError ? "alert" : undefined}
            >
              {renameError}
            </p>
          </form>
        {:else}
          <h3>
            <a class="project-title-link" href={`/projects/${project.id}`}>
              {project.name}
            </a>
          </h3>
          <button
            class="project-rename-trigger"
            type="button"
            aria-label={`Rename ${project.name}`}
            title={`Rename ${project.name}`}
            onclick={beginRename}
          >
            <Icon name="edit" size={14} />
          </button>
        {/if}
        <span class="status" data-status={projectState}>
          {stateLabel(projectState)}
        </span>
      </div>
      <p class="project-source">
        {project.original_filename ?? projectSourceFallback(project)}
      </p>
      <dl class="project-metadata">
        {#if project.media_duration_us !== null && project.media_duration_us > 0}
          <div>
            <dt class="visually-hidden">Duration</dt>
            <dd>{formatDuration(project.media_duration_us)}</dd>
          </div>
        {/if}
        {#if dimensions}
          <div>
            <dt class="visually-hidden">Resolution</dt>
            <dd>{dimensions}</dd>
          </div>
        {/if}
        {#if project.size_bytes !== null}
          <div>
            <dt class="visually-hidden">File size</dt>
            <dd>{formatBytes(project.size_bytes)}</dd>
          </div>
        {/if}
        {#if project.languages.length > 0}
          <div>
            <dt class="visually-hidden">Languages</dt>
            <dd>{formatLanguages(project.languages)}</dd>
          </div>
        {/if}
        {#if project.track_count > 0 || project.cue_count > 0}
          <div>
            <dt class="visually-hidden">Subtitles</dt>
            <dd>
              {formatSubtitleCounts(project.track_count, project.cue_count)}
            </dd>
          </div>
        {/if}
      </dl>
      {#if project.subtitle_match}
        <span class="subtitle-match">Subtitle text match</span>
      {/if}
    </div>
  </div>

  <div class="project-actions">
    <time datetime={activityDate(project.activity_at).toISOString()}>
      Updated {activityDateTime.format(activityDate(project.activity_at))}
    </time>
  </div>
</article>
