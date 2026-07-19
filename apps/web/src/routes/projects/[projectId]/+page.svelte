<script lang="ts">
  import { onMount } from "svelte";
  import { invalidateAll } from "$app/navigation";
  import Icon from "$lib/components/Icon.svelte";

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

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KiB", "MiB", "GiB", "TiB"];
    let value = bytes;
    let unit = -1;
    do {
      value /= 1024;
      unit += 1;
    } while (value >= 1024 && unit < units.length - 1);
    return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unit]}`;
  }
</script>

<svelte:head>
  <title>{data.project.name} · Anysub</title>
</svelte:head>

<a class="breadcrumb" href="/">
  <Icon name="arrow-left" size={16} />
  Projects
</a>

<header class="project-header">
  <div>
    <p class="eyebrow">Subtitle project</p>
    <h1>{data.project.name}</h1>
    <p class="project-source-line">
      <span>{data.project.workspace_name}</span>
      {#if data.project.media_filename}
        <span>{data.project.media_filename}</span>
        {#if data.project.size_bytes}
          <span>{formatBytes(data.project.size_bytes)}</span>
        {/if}
      {:else}
        <span>Worker diagnostic</span>
      {/if}
    </p>
  </div>

  {#if data.run}
    <span
      class="status large"
      data-status={data.run.job_state ?? data.run.status}
    >
      {data.run.status === "completed" ? "Transcript ready" : data.run.status}
    </span>
  {:else if data.project.media_original_key}
    <span class="status large" data-status="ready">Source ready</span>
  {/if}
</header>

{#if data.run}
  {#if data.run.status === "queued" || data.run.status === "running"}
    <div class="processing-banner" aria-live="polite">
      <span class="processing-icon"><Icon name="activity" size={18} /></span>
      <div>
        <strong
          >{data.run.progress_message ??
            "Waiting for a compatible worker"}</strong
        >
        <progress value={data.run.progress ?? 0} max="1">
          {Math.round((data.run.progress ?? 0) * 100)}%
        </progress>
      </div>
      <span>{Math.round((data.run.progress ?? 0) * 100)}%</span>
    </div>
  {:else if data.run.status === "failed"}
    <div class="alert error" role="alert">
      <strong>Transcription failed</strong>
      <span>{String(data.run.error?.message ?? "The adapter run failed.")}</span
      >
    </div>
  {/if}
{/if}

<div class="editor-workspace">
  <section class="media-panel" aria-label="Subtitle preview">
    <header class="panel-toolbar">
      <div>
        <span class="panel-kicker">Preview</span>
        <strong>{data.project.media_filename ?? "Diagnostic source"}</strong>
      </div>
      <span class="preview-state">
        <span></span>
        {data.cues[0] ? "Track visible" : "Source stored"}
      </span>
    </header>

    <div class="media-canvas">
      <div class="canvas-center" aria-hidden="true">
        <span
          ><Icon name={data.cues[0] ? "subtitles" : "play"} size={24} /></span
        >
        {#if !data.cues[0]}
          <p>Media preview will appear after preparation</p>
        {/if}
      </div>
      {#if data.cues[0]}
        <p class="subtitle-overlay">{data.cues[0].text}</p>
      {/if}
    </div>

    <footer class="preview-footer">
      <span>00:00:00.000</span>
      <div class="timeline" aria-hidden="true"><span></span></div>
      <span>--:--:--.---</span>
    </footer>
  </section>

  <section class="transcript-panel" aria-label="Subtitle cues">
    <header class="panel-toolbar transcript-toolbar">
      <div>
        <span class="panel-kicker">Subtitle track</span>
        <strong>{data.track?.name ?? "Transcript"}</strong>
      </div>
      {#if data.track}
        <span class="track-meta"
          >{data.track.language} · {data.cues.length} cue{data.cues.length === 1
            ? ""
            : "s"}</span
        >
      {/if}
    </header>

    {#if data.track}
      <div class="cue-list">
        {#each data.cues as cue, index}
          <article class="cue">
            <span class="cue-index">{String(index + 1).padStart(2, "0")}</span>
            <div>
              <time datetime={`PT${cue.start_us / 1_000_000}S`}>
                {timecode(cue.start_us)}
              </time>
              <span aria-hidden="true">→</span>
              <time datetime={`PT${cue.end_us / 1_000_000}S`}>
                {timecode(cue.end_us)}
              </time>
              <p>{cue.text}</p>
            </div>
          </article>
        {/each}
      </div>
    {:else}
      <div class="transcript-empty">
        <span class="empty-illustration"
          ><Icon name="subtitles" size={28} /></span
        >
        {#if data.run}
          <h2>Preparing the first track</h2>
          <p>
            The worker will place normalized subtitle cues here when processing
            finishes.
          </p>
        {:else if data.project.media_original_key}
          <h2>Ready to transcribe</h2>
          <p>
            Your source is safely stored. Install a speech adapter to select a
            model and start transcription.
          </p>
          <button
            class="button wide"
            type="button"
            disabled
            title="No production speech adapter is installed"
          >
            Transcription engine unavailable
          </button>
          <span class="empty-help"
            >This build currently includes worker diagnostics only.</span
          >
        {:else}
          <h2>No subtitle track</h2>
          <p>This project does not have source media or a transcription run.</p>
        {/if}
      </div>
    {/if}
  </section>
</div>
