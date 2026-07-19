<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { invalidateAll } from "$app/navigation";
  import Icon from "$lib/components/Icon.svelte";

  let { data, form } = $props();
  let selectedModelKey = $state(
    untrack(
      () =>
        (
          data.transcriptionModels.find((model) => model.modelId === "small") ??
          data.transcriptionModels[0]
        )?.key ?? "",
    ),
  );
  let selectedModel = $derived(
    data.transcriptionModels.find((model) => model.key === selectedModelKey),
  );
  let playbackUs = $state(0);
  let mediaDurationUs = $state(0);
  let mediaElement = $state<HTMLMediaElement>();
  let activeCue = $derived(
    data.cues.find(
      (cue) => cue.start_us <= playbackUs && cue.end_us >= playbackUs,
    ),
  );

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

  function isAudioSource(): boolean {
    return (
      data.project.media_type?.startsWith("audio/") ||
      /\.(mp3|wav|m4a|aac|flac|ogg|opus)$/i.test(
        data.project.media_filename ?? "",
      )
    );
  }

  function updatePlayback(event: Event): void {
    const media = event.currentTarget as HTMLMediaElement;
    playbackUs = Math.round(media.currentTime * 1_000_000);
    mediaDurationUs = Number.isFinite(media.duration)
      ? Math.round(media.duration * 1_000_000)
      : 0;
  }

  function seekTo(microseconds: number): void {
    if (!mediaElement) return;
    mediaElement.currentTime = microseconds / 1_000_000;
    void mediaElement.play();
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

  <div class="project-header-actions">
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
    {#if data.project.can_manage}
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
        <button class="button danger quiet" type="submit">Delete project</button
        >
      </form>
    {/if}
  </div>
</header>

{#if form?.message}
  <div class="alert error" role="alert">{form.message}</div>
{/if}

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
      {#if data.project.media_original_key}
        {#if isAudioSource()}
          <div class="audio-preview">
            <span><Icon name="audio" size={28} /></span>
            <strong>{data.project.media_filename}</strong>
            <audio
              bind:this={mediaElement}
              controls
              preload="metadata"
              src={`/api/projects/${data.project.id}/media`}
              ontimeupdate={updatePlayback}
              ondurationchange={updatePlayback}
            ></audio>
          </div>
        {:else}
          <video
            bind:this={mediaElement}
            class="media-player"
            controls
            preload="metadata"
            src={`/api/projects/${data.project.id}/media`}
            ontimeupdate={updatePlayback}
            ondurationchange={updatePlayback}
          >
            <track
              kind="captions"
              srclang={data.track?.language ?? "und"}
              label={`${data.track?.language ?? "Source"} captions`}
              src={`/api/projects/${data.project.id}/captions.vtt`}
            />
          </video>
        {/if}
      {:else}
        <div class="canvas-center" aria-hidden="true">
          <span><Icon name="play" size={24} /></span>
          <p>No source media is attached</p>
        </div>
      {/if}
      {#if activeCue}
        <p class="subtitle-overlay">{activeCue.text}</p>
      {/if}
    </div>

    <footer class="preview-footer">
      <span>{timecode(playbackUs)}</span>
      <div class="timeline" aria-hidden="true">
        <span
          style:width={`${mediaDurationUs ? (playbackUs / mediaDurationUs) * 100 : 0}%`}
        ></span>
      </div>
      <span>{mediaDurationUs ? timecode(mediaDurationUs) : "--:--:--.---"}</span
      >
    </footer>
  </section>

  <section class="transcript-panel" aria-label="Subtitle cues">
    <header class="panel-toolbar transcript-toolbar">
      <div>
        <span class="panel-kicker">Subtitle track</span>
        <strong>{data.track?.name ?? "Transcript"}</strong>
      </div>
      {#if data.track}
        <div class="track-actions">
          <span class="track-meta"
            >{data.track.language} · {data.cues.length} cue{data.cues.length ===
            1
              ? ""
              : "s"}</span
          >
          {#if data.project.can_manage}
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
              <input type="hidden" name="trackId" value={data.track.id} />
              <button class="text-button danger" type="submit"
                >Delete transcript</button
              >
            </form>
          {/if}
        </div>
      {/if}
    </header>

    {#if data.track}
      <div class="cue-list">
        {#each data.cues as cue, index}
          <button
            type="button"
            class:active={activeCue?.id === cue.id}
            class="cue"
            onclick={() => seekTo(cue.start_us)}
          >
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
          </button>
        {/each}
      </div>
    {:else}
      <div class="transcript-empty">
        <span class="empty-illustration"
          ><Icon name="subtitles" size={28} /></span
        >
        {#if data.run && ["queued", "running"].includes(data.run.status)}
          <h2>Preparing the first track</h2>
          <p>
            The worker will place normalized subtitle cues here when processing
            finishes.
          </p>
        {:else if data.project.media_original_key}
          <h2>Ready to transcribe</h2>
          {#if data.transcriptionModels.length}
            <p>
              Choose the accuracy and resource profile for this source. The
              first run downloads its model into the private cache.
            </p>
            <form
              class="transcription-setup"
              method="POST"
              action="?/transcribe"
            >
              <label>
                <span>Model</span>
                <select name="model" bind:value={selectedModelKey} required>
                  {#each data.transcriptionModels as model}
                    <option value={model.key}
                      >{model.adapterName} · {model.displayName}</option
                    >
                  {/each}
                </select>
              </label>
              {#if selectedModel?.description}
                <span class="model-description"
                  >{selectedModel.description}</span
                >
              {/if}
              <label>
                <span>Spoken language</span>
                <select name="language">
                  <option value="auto">Detect automatically</option>
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                  <option value="it">Italian</option>
                  <option value="pt">Portuguese</option>
                  <option value="nl">Dutch</option>
                  <option value="pl">Polish</option>
                  <option value="uk">Ukrainian</option>
                  <option value="el">Greek</option>
                  <option value="ar">Arabic</option>
                  <option value="hi">Hindi</option>
                  <option value="ja">Japanese</option>
                  <option value="ko">Korean</option>
                  <option value="zh">Chinese</option>
                </select>
              </label>
              <label class="check-row">
                <input name="alignment" type="checkbox" checked />
                <span>
                  <strong>Accurate word alignment</strong>
                  <small
                    >Recommended for editing, highlights, and karaoke.</small
                  >
                </span>
              </label>
              <details class="transcription-advanced">
                <summary>Advanced options</summary>
                <label>
                  <span>Maximum line length</span>
                  <input
                    name="maxLineLength"
                    type="number"
                    min="20"
                    max="120"
                    value="42"
                    required
                  />
                </label>
                <small
                  >42 characters is a readable subtitle default. Splits preserve
                  whole words.</small
                >
                <label>
                  <span>Batch size</span>
                  <input
                    name="batchSize"
                    type="number"
                    min="1"
                    max="64"
                    placeholder="Automatic"
                  />
                </label>
                <small>Lower this only if the worker runs out of memory.</small>
              </details>
              <button class="button wide" type="submit">
                <Icon name="activity" size={16} />
                Start transcription
              </button>
              <span class="empty-help"
                >Processing stays on your connected worker. No media leaves
                Anysub.</span
              >
            </form>
          {:else}
            <p>
              A transcription worker is not connected yet. Start or inspect the
              worker container, then this page will offer its models.
            </p>
            <button class="button wide" type="button" disabled>
              Waiting for a speech worker
            </button>
            <span class="empty-help">Model choices appear automatically.</span>
          {/if}
        {:else}
          <h2>No subtitle track</h2>
          <p>This project does not have source media or a transcription run.</p>
        {/if}
      </div>
    {/if}
  </section>
</div>
