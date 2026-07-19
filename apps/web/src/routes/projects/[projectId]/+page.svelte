<script lang="ts">
  import { onMount } from "svelte";
  import { invalidateAll } from "$app/navigation";

  let { data } = $props();

  onMount(() => {
    if (!data.run || !["queued", "running"].includes(data.run.status)) return;
    const interval = window.setInterval(() => void invalidateAll(), 1_500);
    return () => window.clearInterval(interval);
  });

  function timecode(microseconds: number): string {
    const totalMilliseconds = Math.floor(microseconds / 1_000);
    const milliseconds = totalMilliseconds % 1_000;
    const totalSeconds = Math.floor(totalMilliseconds / 1_000);
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const hours = Math.floor(totalSeconds / 3_600);
    return (
      [hours, minutes, seconds]
        .map((value) => String(value).padStart(2, "0"))
        .join(":") + `.${String(milliseconds).padStart(3, "0")}`
    );
  }
</script>

<svelte:head>
  <title>{data.project.name} · Anysub</title>
</svelte:head>

<section class="page-heading">
  <a href="/">← Projects</a>
  <h1>{data.project.name}</h1>
  <p>{data.project.workspace_name} · adapter contract tracer</p>
</section>

{#if data.run}
  <span class="status" data-status={data.run.job_state ?? data.run.status}>
    {data.run.status}
  </span>

  {#if data.run.status === "queued" || data.run.status === "running"}
    <div class="job-progress" aria-live="polite">
      <progress value={data.run.progress ?? 0} max="1">
        {Math.round((data.run.progress ?? 0) * 100)}%
      </progress>
      <p>{data.run.progress_message ?? "Waiting for a compatible worker"}</p>
    </div>
  {:else if data.run.status === "failed"}
    <p class="helper error" role="alert">
      {String(data.run.error?.message ?? "The adapter run failed.")}
    </p>
  {/if}
{/if}

<div class="workbench">
  <section class="preview-panel" aria-label="Subtitle preview">
    {#if data.cues[0]}
      <p>{data.cues[0].text}</p>
    {:else}
      <p>
        Subtitle preview appears when the worker returns a normalized track.
      </p>
    {/if}
  </section>

  <section aria-label="Subtitle cues">
    {#if data.track}
      <div class="page-heading">
        <h2>{data.track.name}</h2>
        <p>
          {data.track.language} · {data.cues.length} cue{data.cues.length === 1
            ? ""
            : "s"}
        </p>
      </div>
      <div class="cue-list">
        {#each data.cues as cue}
          <article class="cue">
            <time datetime={`PT${cue.start_us / 1_000_000}S`}
              >{timecode(cue.start_us)}</time
            >
            <p>{cue.text}</p>
          </article>
        {/each}
      </div>
    {:else}
      <section class="empty-state">
        <div class="empty-mark" aria-hidden="true"></div>
        <h2>No subtitle track yet.</h2>
        <p>
          The queued adapter run will create the first immutable transcription
          track.
        </p>
      </section>
    {/if}
  </section>
</div>
