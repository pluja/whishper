<script lang="ts">
  import { tick } from "svelte";
  import CreateProjectDialog from "#lib/library/CreateProjectDialog.svelte";
  import ProjectRow, {
    PROJECT_ROW_COLUMNS,
  } from "#lib/library/ProjectRow.svelte";
  import {
    carriesMediaFile,
    firstDroppedMediaFile,
  } from "#lib/library/drop-zone.ts";
  import Icon from "#lib/components/Icon.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import EmptyState from "#lib/components/ui/EmptyState.svelte";
  import Input from "#lib/components/ui/Input.svelte";
  import { buttonClasses } from "#lib/components/ui/variants.ts";
  import { pollWhileActive } from "#lib/browser/polling.svelte.ts";
  import { pluralize } from "#lib/shared/format.ts";
  import { PROJECT_SEARCH_MAX_LENGTH } from "#lib/shared/limits.ts";
  import { isProjectActive } from "#lib/shared/project-status.ts";

  let { data, form } = $props();
  let createDialogOpen = $state(false);
  let droppedFile = $state<File | null>(null);
  let dragDepth = $state(0);
  let dragHasMedia = $state(true);
  let dropMessage = $state("");
  let now = $state(new Date());
  let hasActiveSearch = $derived(
    data.search.query.length > 0 || data.search.includeSubtitles,
  );
  let firstThumbnailIndex = $derived(
    data.projects.findIndex((project) => project.hasThumbnail),
  );
  let hasActiveJob = $derived(data.projects.some(isProjectActive));
  let renameActionUrl = $derived.by(() => {
    const search = new URLSearchParams();
    if (data.search.query) search.set("q", data.search.query);
    if (data.search.includeSubtitles) search.set("scope", "subtitles");
    const query = search.toString();
    return query ? `?${query}&/renameProject` : "?/renameProject";
  });
  let acceptsDrops = $derived(data.workspace !== null && !createDialogOpen);

  pollWhileActive(() => hasActiveJob, 2_000);

  $effect(() => {
    const timer = window.setInterval(() => (now = new Date()), 60_000);
    return () => window.clearInterval(timer);
  });

  function openCreateDialog(file: File | null = null) {
    droppedFile = file;
    createDialogOpen = true;
  }

  function carriesFiles(event: DragEvent): boolean {
    return event.dataTransfer?.types.includes("Files") ?? false;
  }

  // The dialog's own file input takes drops natively.
  function targetsFileInput(event: DragEvent): boolean {
    return (
      event.target instanceof HTMLInputElement && event.target.type === "file"
    );
  }

  function handleDragEnter(event: DragEvent) {
    if (!acceptsDrops || !carriesFiles(event)) return;
    if (dragDepth === 0) {
      dragHasMedia = carriesMediaFile(event.dataTransfer);
      dropMessage = "";
    }
    dragDepth += 1;
  }

  function handleDragLeave() {
    if (dragDepth > 0) dragDepth -= 1;
  }

  // Cancelling dragover and drop also stops the browser from navigating to a file dropped outside the dialog's input.
  function handleDragOver(event: DragEvent) {
    if (carriesFiles(event) && !targetsFileInput(event)) event.preventDefault();
  }

  function handleDrop(event: DragEvent) {
    if (!carriesFiles(event) || targetsFileInput(event)) return;
    event.preventDefault();
    dragDepth = 0;
    if (!acceptsDrops) return;
    const file = firstDroppedMediaFile(event.dataTransfer);
    if (file) openCreateDialog(file);
    else void announceRejectedDrop();
  }

  // Cleared first so a repeated rejection is announced again.
  async function announceRejectedDrop() {
    dropMessage = "";
    await tick();
    dropMessage =
      "Not a media file. Drop an audio or video file to create a project.";
  }
</script>

<svelte:head>
  <title>Projects · Anysub</title>
</svelte:head>

<svelte:window
  ondragenter={handleDragEnter}
  ondragleave={handleDragLeave}
  ondragover={handleDragOver}
  ondrop={handleDrop}
/>

{#snippet newProjectButton()}
  <Button variant="primary" onclick={() => openCreateDialog()}>
    <Icon name="plus" size={16} />
    New project
  </Button>
{/snippet}

<div class="py-6 sm:py-8">
  <header class="flex flex-wrap items-end justify-between gap-4">
    <div class="min-w-0">
      <h1 class="text-2xl font-semibold tracking-tight text-text">Projects</h1>
      <p class="mt-1 text-sm text-text-muted">
        {pluralize(data.workspace?.projectCount ?? 0, "project")} ·
        {pluralize(data.workspace?.readySourceCount ?? 0, "source")} ready
      </p>
    </div>
    {#if data.workspace}
      {@render newProjectButton()}
    {/if}
  </header>

  <form
    class="mt-6 flex flex-wrap items-center gap-2"
    method="GET"
    action="/"
    role="search"
  >
    <div
      class="relative min-w-0 basis-full sm:max-w-md sm:flex-1 sm:basis-auto"
    >
      <span
        class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-subtle"
        aria-hidden="true"
      >
        <Icon name="search" size={16} />
      </span>
      <Input
        type="search"
        name="q"
        autocomplete="off"
        value={data.search.query}
        placeholder="Search projects"
        aria-label="Search projects"
        maxlength={PROJECT_SEARCH_MAX_LENGTH}
        class="pr-9 pl-9 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {#if hasActiveSearch}
        <a
          href="/"
          aria-label="Clear search"
          title="Clear search"
          class="{buttonClasses(
            'ghost',
            'sm',
            true,
          )} absolute top-1/2 right-0.5 size-8 -translate-y-1/2"
        >
          <Icon name="close" size={14} />
        </a>
      {/if}
    </div>
    <label
      class="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border-strong bg-surface px-3 text-sm text-text transition-colors duration-150 hover:bg-surface-sunken has-checked:border-accent has-checked:bg-accent-soft motion-reduce:transition-none"
    >
      <input
        type="checkbox"
        name="scope"
        value="subtitles"
        checked={data.search.includeSubtitles}
        class="size-4 accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      />
      Subtitle text
    </label>
    <Button type="submit">Search</Button>
  </form>

  {#if data.workspace}
    <CreateProjectDialog
      bind:open={createDialogOpen}
      workspaceId={data.workspace.id}
      maxUploadBytes={data.maxUploadBytes}
      initialFile={droppedFile}
    />
  {/if}

  <section class="mt-6" aria-labelledby="project-list-title">
    <div
      class="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
    >
      <h2 id="project-list-title" class="text-sm font-medium text-text">
        {hasActiveSearch ? "Search results" : "All projects"}
      </h2>
      <p class="text-xs text-text-muted">
        {pluralize(data.projects.length, "project")}
        {#if data.search.query && data.search.includeSubtitles}
          matching project titles or subtitle text for “{data.search.query}”
        {:else if data.search.query}
          matching project titles for “{data.search.query}”
        {:else if data.search.includeSubtitles}
          in this workspace. Subtitle text will be included when you search.
        {:else}
          ordered by recent activity
        {/if}
      </p>
    </div>

    {#if data.projects.length === 0 && hasActiveSearch}
      <EmptyState
        icon="search"
        title="No projects match this search"
        tone="accent"
      >
        <p>
          {data.search.includeSubtitles
            ? "Try a shorter project title or subtitle phrase."
            : "Try another title or include subtitle text in your search."}
        </p>
        <Button href="/">Clear search</Button>
      </EmptyState>
    {:else if data.projects.length === 0}
      <EmptyState icon="subtitles" title="No projects yet" tone="accent">
        {#if data.workspace}
          {@render newProjectButton()}
          <p>or drop a media file anywhere</p>
        {/if}
      </EmptyState>
    {:else}
      <div class="overflow-hidden rounded-lg border border-border bg-surface">
        <div
          class="hidden gap-x-4 border-b border-border px-4 py-2 text-xs font-medium text-text-muted sm:grid {PROJECT_ROW_COLUMNS}"
          aria-hidden="true"
        >
          <span class="col-span-2">Name</span>
          <span class="text-right">Duration</span>
          <span>Status</span>
          <span>Last edited</span>
        </div>
        <ul class="divide-y divide-border">
          {#each data.projects as project, index (project.id)}
            <ProjectRow
              {project}
              {form}
              {now}
              eagerThumbnail={index === firstThumbnailIndex}
              renameAction={renameActionUrl}
            />
          {/each}
        </ul>
      </div>
    {/if}
  </section>
</div>

<p class="sr-only" role="status">{dropMessage}</p>

{#if dragDepth > 0}
  <div
    class="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-overlay p-6 transition-opacity duration-150 motion-reduce:transition-none starting:opacity-0"
    aria-hidden="true"
  >
    <div
      class={[
        "grid justify-items-center gap-3 rounded-xl border-2 border-dashed bg-surface-raised px-10 py-8 text-center shadow-xl",
        dragHasMedia ? "border-accent" : "border-danger",
      ]}
    >
      <span class={dragHasMedia ? "text-accent" : "text-danger"}>
        <Icon name="file" size={28} />
      </span>
      <p class="text-base font-semibold text-text">
        {dragHasMedia ? "Drop to create a project" : "Not a media file"}
      </p>
      <p class="text-sm text-text-muted">
        {dragHasMedia ? "Audio or video files" : "Drop an audio or video file"}
      </p>
    </div>
  </div>
{/if}
