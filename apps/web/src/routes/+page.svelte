<script lang="ts">
  import { onMount } from "svelte";
  import { invalidateAll } from "$app/navigation";

  let { data, form } = $props();

  onMount(() => {
    const hasActiveJob = data.projects.some(
      (project: { job_state: string | null }) =>
        project.job_state === "queued" || project.job_state === "leased",
    );
    if (!hasActiveJob) return;
    const interval = window.setInterval(() => void invalidateAll(), 2_000);
    return () => window.clearInterval(interval);
  });

  function displayState(project: {
    run_status: string | null;
    job_state: string | null;
  }) {
    return project.run_status ?? project.job_state ?? "draft";
  }
</script>

<svelte:head>
  <title>Projects · Anysub</title>
</svelte:head>

<section class="page-heading">
  <h1>{data.workspace?.name ?? "Projects"}</h1>
  <p>
    Each project keeps one source media item, its transcription runs, and
    editable tracks.
  </p>
</section>

{#if form?.message}
  <p class="helper error" role="alert">{form.message}</p>
{/if}

{#if data.projects.length === 0}
  <section class="empty-state">
    <div class="empty-mark" aria-hidden="true"></div>
    <h2>No projects yet.</h2>
    <p>
      Start with a deterministic adapter run. It uses no media or model download
      and verifies the application-to-worker contract.
    </p>
    <form method="POST" action="?/createDemo">
      <button class="button" type="submit">Run adapter demo</button>
    </form>
  </section>
{:else}
  <div class="projects-list">
    {#each data.projects as project}
      <a class="project-row" href={`/projects/${project.id}`}>
        <div>
          <h2>{project.name}</h2>
          <p>{project.progress_message ?? "Project ready"}</p>
        </div>
        <span
          class="status"
          data-status={project.job_state ?? project.run_status ?? "draft"}
        >
          {displayState(project)}
        </span>
        <time datetime={project.created_at.toISOString()}>
          {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
            new Date(project.created_at),
          )}
        </time>
      </a>
    {/each}
  </div>

  <form
    method="POST"
    action="?/createDemo"
    style="margin-block-start: var(--space-xl)"
  >
    <button class="button secondary" type="submit">Run another demo</button>
  </form>
{/if}
