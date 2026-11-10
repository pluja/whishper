<script module lang="ts">
  export const PROJECT_ROW_COLUMNS =
    "sm:grid-cols-[4rem_minmax(0,1fr)_4.5rem_9rem_8rem_2rem]";

  const activityDateTime = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
</script>

<script lang="ts">
  import { tick } from "svelte";
  import { enhance } from "$app/forms";
  import Icon from "$lib/components/Icon.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import IconButton from "$lib/components/ui/IconButton.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import Menu from "$lib/components/ui/Menu.svelte";
  import MenuItem from "$lib/components/ui/MenuItem.svelte";
  import StatusBadge from "$lib/components/ui/StatusBadge.svelte";
  import { formatDuration, formatRelativeTime } from "$lib/shared/format";
  import type { ProjectSummary } from "$lib/shared/library-data";
  import { PROJECT_TITLE_MAX_LENGTH } from "$lib/shared/limits";
  import {
    displayState,
    projectProgress,
    projectSourceFallback,
  } from "$lib/shared/project-status";
  import { projectDerivativeUrl, projectPageUrl } from "$lib/shared/routes";
  import type { SubmitFunction } from "@sveltejs/kit";
  import { mediaPlaceholder } from "./media-placeholder";

  type RenameForm = { renameProjectId?: string; renameError?: string } | null;
  type Props = {
    project: ProjectSummary;
    now: Date;
    eagerThumbnail: boolean;
    renameAction: string;
    form: RenameForm;
  };

  let { project, now, eagerThumbnail, renameAction, form }: Props = $props();

  // svelte-ignore state_referenced_locally
  let editing = $state(form?.renameProjectId === project.id);
  // svelte-ignore state_referenced_locally
  let renameDraft = $state(project.name);
  let renameSaving = $state(false);
  let menuTrigger: HTMLElement | undefined;
  let renameError = $derived(
    form?.renameProjectId === project.id ? (form.renameError ?? "") : "",
  );
  let hasDuration = $derived(
    project.mediaDurationUs !== null && project.mediaDurationUs > 0,
  );
  let lastEdited = $derived(formatRelativeTime(project.activityAt, now));

  function beginRename() {
    renameDraft = project.name;
    editing = true;
  }

  function rememberMenuTrigger(trigger: HTMLElement) {
    menuTrigger = trigger;
  }

  function focusAndSelect(input: HTMLInputElement) {
    input.focus();
    input.select();
  }

  async function endRename() {
    editing = false;
    await tick();
    menuTrigger?.focus();
  }

  function handleRenameKeydown(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    void endRename();
  }

  const enhanceRename: SubmitFunction = () => {
    renameSaving = true;
    return async ({ result, update }) => {
      renameSaving = false;
      if (result.type === "failure") editing = true;
      else if (result.type === "success" || result.type === "redirect") {
        void endRename();
      }
      await update({ reset: false });
    };
  };
</script>

<li
  class="group relative grid grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-3 transition-colors duration-150 hover:bg-surface-sunken/60 motion-reduce:transition-none sm:gap-x-4 sm:px-4 {PROJECT_ROW_COLUMNS}"
>
  <div
    class="row-span-2 grid h-9 w-16 place-items-center overflow-hidden rounded border border-border bg-surface-sunken text-text-subtle sm:row-span-1"
  >
    {#if project.hasThumbnail}
      <img
        src={projectDerivativeUrl(project.id, "thumbnail")}
        alt=""
        width="640"
        height="360"
        class="size-full object-cover"
        loading={eagerThumbnail ? "eager" : "lazy"}
        fetchpriority={eagerThumbnail ? "high" : "auto"}
      />
    {:else}
      {@const placeholder = mediaPlaceholder(project)}
      <Icon name={placeholder.icon} size={18} />
      <span class="sr-only">{placeholder.label}</span>
    {/if}
  </div>

  <div class="min-w-0">
    {#if editing}
      <form
        class="relative z-10 grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1"
        method="POST"
        action={renameAction}
        use:enhance={enhanceRename}
      >
        <input type="hidden" name="projectId" value={project.id} />
        <label for={`project-title-${project.id}`} class="sr-only">Title</label>
        <Input
          {@attach focusAndSelect}
          id={`project-title-${project.id}`}
          name="name"
          bind:value={renameDraft}
          required
          maxlength={PROJECT_TITLE_MAX_LENGTH}
          onkeydown={handleRenameKeydown}
          aria-invalid={renameError !== ""}
          aria-describedby={renameError
            ? `rename-error-${project.id}`
            : undefined}
          class="h-8"
        />
        <IconButton
          type="submit"
          icon="check"
          size="sm"
          label={renameSaving ? "Saving title" : "Save title"}
          disabled={renameSaving}
        />
        <IconButton
          icon="close"
          size="sm"
          label="Cancel renaming"
          onclick={endRename}
        />
        {#if renameError}
          <p
            id={`rename-error-${project.id}`}
            class="col-span-3 text-xs text-danger"
            role="alert"
          >
            {renameError}
          </p>
        {/if}
      </form>
    {:else}
      <h3 class="text-sm font-medium text-text">
        <a
          href={projectPageUrl(project.id)}
          title={project.name}
          class="block truncate rounded-sm after:absolute after:inset-0 after:rounded-[inherit] hover:text-accent focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-focus"
        >
          {project.name}
        </a>
      </h3>
      <p class="flex min-w-0 items-center gap-2 text-xs text-text-muted">
        <span class="truncate max-sm:hidden">
          {project.originalFilename ?? projectSourceFallback(project)}
        </span>
        {#if project.subtitleMatch}
          <Badge tone="accent">Subtitle text match</Badge>
        {/if}
      </p>
    {/if}
  </div>

  <div
    class="col-start-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted sm:contents sm:text-sm"
  >
    <span class="sm:col-start-4 sm:row-start-1">
      <StatusBadge
        status={displayState(project)}
        progress={projectProgress(project)}
      />
    </span>
    <span class="flex items-center gap-2 whitespace-nowrap sm:contents">
      <span
        class={[
          "font-mono tabular-nums sm:col-start-3 sm:row-start-1 sm:text-right",
          !hasDuration && "max-sm:hidden",
        ]}
      >
        {#if hasDuration}
          <span class="sr-only">Duration</span>
          {formatDuration(project.mediaDurationUs ?? 0)}
        {/if}
      </span>
      <time
        datetime={project.activityAt.toISOString()}
        title={activityDateTime.format(project.activityAt)}
        class="truncate sm:col-start-5 sm:row-start-1"
      >
        <span class="sr-only">Last edited</span>
        {lastEdited}
      </time>
    </span>
  </div>

  <div
    class="relative z-10 col-start-3 row-span-2 row-start-1 sm:col-start-6 sm:row-span-1"
  >
    <Menu label={`Actions for ${project.name}`} align="end">
      {#snippet trigger(args)}
        <IconButton
          {@attach rememberMenuTrigger}
          {...args}
          label={`Actions for ${project.name}`}
          icon="more"
          size="sm"
          class="group-focus-within:text-text group-hover:text-text"
        />
      {/snippet}
      <MenuItem href={projectPageUrl(project.id)}>
        <Icon name="play" size={16} />
        Open
      </MenuItem>
      <MenuItem onselect={beginRename}>
        <Icon name="edit" size={16} />
        Rename
      </MenuItem>
    </Menu>
  </div>
</li>
