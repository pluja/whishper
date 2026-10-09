<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { invalidateAll } from "$app/navigation";
  import Icon from "$lib/components/Icon.svelte";
  import CueList from "$lib/components/studio/CueList.svelte";
  import EditorToolbar from "$lib/components/studio/EditorToolbar.svelte";
  import ProcessingStatus from "$lib/components/studio/ProcessingStatus.svelte";
  import ShortcutGuide from "$lib/components/studio/ShortcutGuide.svelte";
  import StudioTitlebar from "$lib/components/studio/StudioTitlebar.svelte";
  import Timeline from "$lib/components/studio/Timeline.svelte";
  import TranscribePanel from "$lib/components/studio/TranscribePanel.svelte";
  import type { EditorCue } from "$lib/editor/cues";
  import { CueEditor } from "$lib/editor/editor.svelte";
  import { PaneWidth } from "$lib/editor/pane-width.svelte";
  import {
    handleStudioKeydown,
    type StudioCommands,
  } from "$lib/editor/shortcuts";
  import { Transport, frameDurationUs } from "$lib/editor/transport.svelte";

  let { data, form } = $props();

  function editorCues(): EditorCue[] {
    return data.cues.map((cue) => ({
      ...cue,
      start_us: Number(cue.start_us),
      end_us: Number(cue.end_us),
    }));
  }

  let selectedModelKey = $state(
    untrack(
      () =>
        (
          data.transcriptionModels.find((model) => model.recommended) ??
          data.transcriptionModels.find((model) => model.modelId === "small") ??
          data.transcriptionModels[0]
        )?.key ?? "",
    ),
  );
  let loadedTrackId = $state<string | null>(
    untrack(() => data.track?.id ?? null),
  );
  let shortcutGuide = $state<ReturnType<typeof ShortcutGuide>>();
  const paneWidth = new PaneWidth();

  const editor: CueEditor = new CueEditor({
    cues: untrack(editorCues),
    revision: Number(untrack(() => data.track?.revision ?? 0)),
    track: () =>
      data.track
        ? { projectId: data.project.id, trackId: data.track.id }
        : null,
    maxLineLength: () => maxLineLength,
    playbackUs: () => transport.playbackUs,
    sourceDurationUs: () => sourceDurationUs,
  });
  const transport: Transport = new Transport(editor, {
    frameDurationUs: () =>
      frameDurationUs(
        data.project.media_frame_rate_num,
        data.project.media_frame_rate_den,
      ),
    sourceDurationUs: () => sourceDurationUs,
  });

  let maxLineLength = $derived(
    Number(data.track?.metadata?.maxLineLength ?? 42),
  );
  let sourceDurationUs = $derived.by(() => {
    const preparedDurationUs = Number(data.project.media_duration_us ?? 0);
    if (Number.isSafeInteger(preparedDurationUs) && preparedDurationUs > 0) {
      return preparedDurationUs;
    }
    const trackDurationUs = Number(data.track?.metadata?.durationUs ?? 0);
    return Math.max(
      Number.isSafeInteger(trackDurationUs) && trackDurationUs > 0
        ? trackDurationUs
        : 0,
      transport.mediaDurationUs,
    );
  });
  let waveformUrl = $derived(derivativeUrl("waveform"));
  let proxyUrl = $derived(derivativeUrl("proxy"));
  let thumbnailUrl = $derived(derivativeUrl("thumbnail"));
  let previewUrl = $derived(
    proxyUrl ?? `/api/projects/${data.project.id}/media`,
  );
  let isAudioSource = $derived(
    data.project.media_type?.startsWith("audio/") ||
      /\.(mp3|wav|m4a|aac|flac|ogg|opus)$/i.test(
        data.project.media_filename ?? "",
      ),
  );

  const commands: StudioCommands = {
    transport,
    isGuideOpen: () => shortcutGuide?.isOpen() ?? false,
    openGuide: () => shortcutGuide?.open(),
    canSave: () => data.track !== null,
    save: () => void editor.autosave.flush(),
    canUndo: () => editor.history.undoStack.length > 0,
    undo: () => editor.undo(),
    canRedo: () => editor.history.redoStack.length > 0,
    redo: () => editor.redo(),
    hasSelection: () => editor.selectedCueIndex >= 0,
    splitSelected: () => editor.splitSelected(),
    deleteSelected: () => editor.deleteSelected(),
  };

  function derivativeUrl(kind: string): string | null {
    return (
      data.derivatives.find((derivative) => derivative.kind === kind)?.url ??
      null
    );
  }

  function onStudioKeydown(event: KeyboardEvent): void {
    handleStudioKeydown(event, commands);
  }

  $effect(() => {
    if (!data.track || data.track.id === loadedTrackId) return;
    loadedTrackId = data.track.id;
    editor.loadTrack(editorCues(), Number(data.track.revision));
  });

  onMount(() => {
    paneWidth.restore();
    const interval =
      (data.run && ["queued", "running"].includes(data.run.status)) ||
      (data.preparation &&
        ["queued", "leased"].includes(data.preparation.state))
        ? window.setInterval(() => {
            if (
              (data.run && ["queued", "running"].includes(data.run.status)) ||
              (data.preparation &&
                ["queued", "leased"].includes(data.preparation.state))
            ) {
              void invalidateAll();
            } else if (interval) {
              window.clearInterval(interval);
            }
          }, 1_500)
        : undefined;
    editor.autosave.recoverJournal();
    const releaseUnloadGuard = editor.autosave.guardUnload();
    return () => {
      if (interval) window.clearInterval(interval);
      releaseUnloadGuard();
      paneWidth.dispose();
      transport.resetShuttleRate();
    };
  });
</script>

<svelte:head>
  <title>{data.project.name} · Anysub</title>
</svelte:head>

<svelte:window onkeydown={onStudioKeydown} />

<div class="project-editor-page">
  <StudioTitlebar
    project={data.project}
    track={data.track}
    derivativeKinds={data.derivatives.map((derivative) => derivative.kind)}
    cueCount={editor.cues.length}
    autosave={editor.autosave}
    onopenshortcuts={() => shortcutGuide?.open()}
  />

  {#if form?.message}
    <div class="alert error" role="alert">{form.message}</div>
  {/if}

  <ProcessingStatus
    run={data.run}
    preparation={data.preparation}
    mediaPreparationStatus={data.project.media_preparation_status}
  />
  <div
    class="editor-workspace"
    style:--editor-pane-width={`${paneWidth.width}px`}
  >
    <section class="media-panel" aria-label="Subtitle preview">
      <header class="panel-toolbar">
        <div>
          <span class="panel-kicker">Program monitor</span>
          <strong>{data.project.media_filename ?? "Diagnostic source"}</strong>
        </div>
        <span
          class="preview-state"
          data-state={data.project.media_preparation_status}
        >
          <span></span>
          {proxyUrl
            ? "Editing proxy"
            : data.project.media_preparation_status === "completed"
              ? "Source prepared"
              : data.cues[0]
                ? "Track visible"
                : "Source stored"}
        </span>
      </header>

      <div class="media-canvas">
        {#if data.project.media_original_key}
          {#if isAudioSource}
            <div class="audio-preview">
              <span><Icon name="audio" size={28} /></span>
              <strong>{data.project.media_filename}</strong>
              <audio
                bind:this={transport.mediaElement}
                controls
                preload="metadata"
                src={previewUrl}
                onkeydowncapture={onStudioKeydown}
                ontimeupdate={transport.updatePlayback}
                ondurationchange={transport.updatePlayback}
              ></audio>
            </div>
          {:else}
            <video
              bind:this={transport.mediaElement}
              class="media-player"
              controls
              preload="metadata"
              src={previewUrl}
              poster={thumbnailUrl ?? undefined}
              onkeydowncapture={onStudioKeydown}
              ontimeupdate={transport.updatePlayback}
              ondurationchange={transport.updatePlayback}
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
        {#if transport.activeCue}
          <p class="subtitle-overlay">{transport.activeCue.text}</p>
        {/if}
      </div>

      <Timeline
        durationUs={sourceDurationUs}
        probeState={data.project.media_preparation_status}
        {waveformUrl}
        cues={editor.cues}
        selectedCueId={editor.selectedCueId}
        playbackUs={transport.playbackUs}
        onseek={transport.seekTo}
        onselect={(cueId) => editor.select(cueId)}
        oncommittiming={(timing) => editor.retime(timing)}
      />
    </section>

    <button
      class="studio-divider"
      type="button"
      aria-label="Resize subtitle panel with the left and right arrow keys"
      onpointerdown={paneWidth.beginResize}
      onkeydown={paneWidth.resizeWithKeyboard}
    >
      <span></span>
    </button>

    <section class="transcript-panel" aria-label="Subtitle cues">
      <header class="panel-toolbar transcript-toolbar">
        <div>
          <span class="panel-kicker">Text</span>
          <strong>{data.track?.name ?? "Transcript"}</strong>
        </div>
        {#if data.track}
          <div class="track-summary">
            <span class="track-meta">
              {data.track.language} · {editor.cues.length} cue{editor.cues
                .length === 1
                ? ""
                : "s"}
            </span>
          </div>
        {/if}
      </header>

      {#if data.track}
        <EditorToolbar {editor} />
        <CueList
          {editor}
          activeCueId={transport.activeCue?.id}
          onseek={transport.seekTo}
        />
      {:else}
        <div class="transcript-empty">
          <span class="empty-illustration"
            ><Icon name="subtitles" size={28} /></span
          >
          {#if data.run && ["queued", "running"].includes(data.run.status)}
            <h2>Preparing the first track</h2>
            <p>
              The worker will place normalized subtitle cues here when
              processing finishes.
            </p>
          {:else if data.project.media_original_key}
            <h2>Ready to transcribe</h2>
            <TranscribePanel
              models={data.transcriptionModels}
              hardware={data.detectedHardware}
              bind:selectedModelKey
            />
          {:else}
            <h2>No subtitle track</h2>
            <p>
              This project does not have source media or a transcription run.
            </p>
          {/if}
        </div>
      {/if}
    </section>
  </div>
  <ShortcutGuide bind:this={shortcutGuide} />
</div>
