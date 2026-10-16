<script lang="ts">
  import CreateProjectDialog from "$lib/library/CreateProjectDialog.svelte";
  import ProjectCard from "$lib/library/ProjectCard.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import { pollWhileActive } from "$lib/browser/polling.svelte";
  import { pluralize } from "$lib/shared/format";
  import { PROJECT_SEARCH_MAX_LENGTH } from "$lib/shared/limits";
  import { isProjectActive } from "$lib/shared/project-status";

  let { data, form } = $props();
  let createDialogOpen = $state(false);
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

  pollWhileActive(() => hasActiveJob, 2_000);
</script>

<svelte:head>
  <title>Projects · Anysub</title>
</svelte:head>

<div class="project-library-page">
  <header class="library-header">
    <div class="library-heading">
      <p class="library-context">{data.workspace?.name ?? "Workspace"}</p>
      <h1>Projects</h1>
      <p class="library-summary">
        {pluralize(data.workspace?.projectCount ?? 0, "project")} ·
        {pluralize(data.workspace?.readySourceCount ?? 0, "source")} ready
      </p>
    </div>
  </header>

  <div class="library-toolbar">
    {#if data.workspace}
      <button
        class="button library-new-project"
        type="button"
        onclick={() => (createDialogOpen = true)}
      >
        <Icon name="plus" size={17} />
        New project
      </button>
    {/if}

    <form class="project-search" method="GET" action="/" role="search">
      <label class="project-search-field">
        <span class="visually-hidden">Search projects</span>
        <span class="project-search-control">
          <Icon name="search" size={18} />
          <input
            type="search"
            name="q"
            autocomplete="off"
            value={data.search.query}
            placeholder="Search projects"
            maxlength={PROJECT_SEARCH_MAX_LENGTH}
          />
          {#if hasActiveSearch}
            <a class="search-clear" href="/" aria-label="Clear search">
              <Icon name="close" size={15} />
            </a>
          {/if}
        </span>
      </label>
      <label
        class="search-scope"
        data-selected={data.search.includeSubtitles ? "true" : undefined}
      >
        <input
          type="checkbox"
          name="scope"
          value="subtitles"
          checked={data.search.includeSubtitles}
        />
        <span>Subtitle text</span>
      </label>
      <button class="button secondary search-submit" type="submit">
        Search
      </button>
    </form>
  </div>

  {#if data.workspace}
    <CreateProjectDialog
      bind:open={createDialogOpen}
      workspaceId={data.workspace.id}
    />
  {/if}

  <section class="projects-section" aria-labelledby="project-list-title">
    <div class="section-title-row">
      <div>
        <h2 id="project-list-title">
          {hasActiveSearch ? "Search results" : "All projects"}
        </h2>
        <p class="project-result-count">
          <strong>{pluralize(data.projects.length, "project")}</strong>
          {#if data.search.query && data.search.includeSubtitles}
            matching project titles or subtitle text for “{data.search.query}”.
          {:else if data.search.query}
            matching project titles for “{data.search.query}”.
          {:else if data.search.includeSubtitles}
            in this workspace. Subtitle text will be included when you search.
          {:else}
            in this workspace, ordered by recent activity.
          {/if}
        </p>
      </div>
    </div>

    {#if data.projects.length === 0}
      <div class="projects-empty">
        <div class="empty-illustration" aria-hidden="true">
          <Icon name="subtitles" size={30} />
        </div>
        {#if hasActiveSearch}
          <h3>No projects match this search</h3>
          <p>
            {data.search.includeSubtitles
              ? "Try a shorter project title or subtitle phrase."
              : "Try another title or include subtitle text in your search."}
          </p>
          <a class="button secondary" href="/">Clear search</a>
        {:else}
          <h3>Your project library is empty</h3>
          <p>
            Import a recording, interview, lecture, or film to create its
            private subtitle workspace.
          </p>
          {#if data.workspace}
            <button
              class="button"
              type="button"
              onclick={() => (createDialogOpen = true)}
            >
              New project
            </button>
          {/if}
        {/if}
      </div>
    {:else}
      <div class="projects-list">
        {#each data.projects as project, index (project.id)}
          <ProjectCard
            {project}
            {form}
            eagerThumbnail={index === firstThumbnailIndex}
            renameAction={renameActionUrl}
          />
        {/each}
      </div>
    {/if}
  </section>
</div>
