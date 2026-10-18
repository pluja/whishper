<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { beforeNavigate, invalidateAll } from "$app/navigation";
  import { pollWhileActive } from "$lib/browser/polling.svelte";
  import { CueEditor } from "$lib/editor/editor.svelte";
  import { PaneWidth } from "$lib/editor/pane-width.svelte";
  import {
    handleStudioKeydown,
    type StudioCommands,
  } from "$lib/editor/shortcuts";
  import { frameDurationUs } from "$lib/editor/transport.svelte";
  import { DEFAULT_MAX_LINE_LENGTH } from "$lib/shared/limits";
  import { isRunActive, isStudioActive } from "$lib/shared/project-status";
  import MediaMonitor from "$lib/studio/MediaMonitor.svelte";
  import {
    derivativeUrl,
    editorCues,
    isEditingLocked,
    knownDurationUs,
  } from "$lib/studio/project-view";
  import ShortcutGuide from "$lib/studio/ShortcutGuide.svelte";
  import StudioTitlebar from "$lib/studio/StudioTitlebar.svelte";
  import TranscribeDialog from "$lib/studio/TranscribeDialog.svelte";
  import TranscriptPanel from "$lib/studio/TranscriptPanel.svelte";
  import Timeline from "$lib/timeline/Timeline.svelte";

  let { data, form } = $props();

  pollWhileActive(() => isStudioActive(data), 1_500);

  let shortcutGuideOpen = $state(false);
  let transcribeDialogOpen = $state(false);
  let hasSourceMedia = $derived(Boolean(data.project.mediaOriginalKey));
  let hasTrackAndMedia = $derived(data.track !== null && hasSourceMedia);
  let maxLineLength = $derived(
    Number(data.track?.metadata?.maxLineLength ?? DEFAULT_MAX_LINE_LENGTH),
  );
  let preparedDurationUs = $derived(
    knownDurationUs(data.project.mediaDurationUs),
  );
  let trackDurationUs = $derived(
    knownDurationUs(data.track?.metadata?.durationUs),
  );

  const paneWidth = new PaneWidth();
  const editor = new CueEditor({
    cues: untrack(() => editorCues(data.cues)),
    maxLineLength: () => maxLineLength,
    readOnly: () => isEditingLocked(data.track, data.run),
    transport: {
      frameDurationUs: () =>
        frameDurationUs(
          data.project.mediaFrameRateNum,
          data.project.mediaFrameRateDen,
        ),
      preparedDurationUs: () => preparedDurationUs,
      trackDurationUs: () => trackDurationUs,
    },
  });
  const commands: StudioCommands = {
    transport: editor.transport,
    isDialogOpen: () => shortcutGuideOpen || transcribeDialogOpen,
    openGuide: () => (shortcutGuideOpen = true),
    canSave: () => data.track !== null,
    save: () => void editor.autosave.flush(),
    canUndo: () => editor.canUndo,
    undo: () => editor.undo(),
    canRedo: () => editor.canRedo,
    redo: () => editor.redo(),
    hasSelection: () => editor.hasSelection,
    splitSelected: () => editor.splitSelected(),
    deleteSelected: () => editor.deleteSelected(),
  };

  async function saveBeforeTranscribing(): Promise<string | null> {
    await editor.autosave.flush();
    return editor.autosave.hasUnsavedChanges
      ? "Your latest edits could not be saved, so the transcription did not start. Try again once they are saved."
      : null;
  }

  function onStudioKeydown(event: KeyboardEvent): void {
    handleStudioKeydown(event, commands);
  }

  // SvelteKit reuses this component across projects, so a changed or
  // missing track must replace the editor state rather than be skipped.
  $effect(() => {
    const track = data.track;
    const trackRef = track
      ? { projectId: data.project.id, trackId: track.id }
      : null;
    untrack(() =>
      editor.loadTrack(
        trackRef,
        editorCues(data.cues),
        Number(track?.revision ?? 0),
      ),
    );
  });

  $effect(() => {
    if (!editor.readOnly) untrack(() => editor.recoverDeferredJournal());
  });

  // Another tab started the run: reload the studio so the editor locks and
  // follows the run.
  $effect(() => {
    if (editor.autosave.blockedByTranscription) untrack(() => invalidateAll());
  });

  // The dialog unmounts without closing when its track or media goes away.
  $effect(() => {
    if (!hasTrackAndMedia) transcribeDialogOpen = false;
  });

  beforeNavigate((navigation) => {
    const canSave = editor.autosave.leave();
    if (navigation.willUnload) {
      if (editor.autosave.hasUnsavedChanges) navigation.cancel();
      return;
    }
    if (
      !canSave &&
      !window.confirm(
        "Your latest edits could not be saved. They stay in this browser until you return. Leave anyway?",
      )
    ) {
      navigation.cancel();
    }
  });

  onMount(() => {
    paneWidth.restore();
    return () => {
      editor.autosave.dispose();
      paneWidth.dispose();
      editor.transport.resetShuttleRate();
    };
  });
</script>

<svelte:head>
  <title>{data.project.name} · Anysub</title>
</svelte:head>

<svelte:window onkeydown={onStudioKeydown} />

<!-- project-editor-page scopes the legacy cue list and toolbar rules until they are restyled. -->
<div
  class="project-editor-page flex min-h-dvh flex-col bg-bg text-text lg:h-dvh lg:overflow-hidden"
>
  <StudioTitlebar
    project={data.project}
    track={data.track}
    derivativeKinds={data.derivatives.map((derivative) => derivative.kind)}
    autosave={editor.autosave}
    canRetranscribe={hasTrackAndMedia && !isRunActive(data.run)}
    onretranscribe={() => (transcribeDialogOpen = true)}
    onopenshortcuts={() => (shortcutGuideOpen = true)}
  />

  {#if form?.message}
    <div
      class="shrink-0 border-b border-border bg-danger-soft px-4 py-2 text-sm text-danger"
      role="alert"
    >
      {form.message}
    </div>
  {/if}

  <div
    class="grid flex-1 grid-cols-1 lg:min-h-0 lg:grid-cols-[minmax(24rem,1fr)_auto_minmax(0,var(--transcript-pane-width))]"
    style:--transcript-pane-width={`${paneWidth.value}px`}
  >
    <MediaMonitor
      project={data.project}
      track={data.track}
      derivatives={data.derivatives}
      {editor}
      onmediakeydown={onStudioKeydown}
    />

    <!-- A focusable separator is the ARIA window splitter widget, which Svelte's role table treats as static. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div
      class="group relative z-10 -mx-2 hidden w-4 cursor-col-resize touch-none focus-visible:outline-none lg:block"
      role="separator"
      tabindex="0"
      aria-orientation="vertical"
      aria-label="Resize transcript pane"
      aria-valuenow={paneWidth.value}
      aria-valuemin={paneWidth.min}
      aria-valuemax={paneWidth.max}
      onpointerdown={paneWidth.beginResize}
      onkeydown={paneWidth.resizeWithKeyboard}
    >
      <span
        class="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-transparent transition-colors duration-150 group-hover:bg-accent group-focus-visible:bg-focus motion-reduce:transition-none"
      ></span>
    </div>

    <TranscriptPanel
      {editor}
      track={data.track}
      run={data.run}
      preparation={data.preparation}
      mediaPreparationStatus={data.project.mediaPreparationStatus}
      {hasSourceMedia}
      transcriptionModels={data.transcriptionModels}
      detectedHardware={data.detectedHardware}
    />
  </div>

  <div class="shrink-0">
    <Timeline
      durationUs={editor.transport.sourceDurationUs}
      probeState={data.project.mediaPreparationStatus}
      waveformUrl={derivativeUrl(data.derivatives, "waveform")}
      cues={editor.cues}
      selectedCueId={editor.selectedCueId}
      playbackUs={editor.transport.playbackUs}
      playing={editor.transport.playing}
      seekRevision={editor.transport.seekRevision}
      editable={!editor.readOnly}
      onseek={editor.transport.seekTo}
      onselect={(cueId) => editor.select(cueId)}
      oncommittiming={(timing, gesture) => editor.retime(timing, gesture)}
    />
  </div>
  <ShortcutGuide bind:open={shortcutGuideOpen} />
  {#if hasTrackAndMedia}
    <TranscribeDialog
      bind:open={transcribeDialogOpen}
      models={data.transcriptionModels}
      hardware={data.detectedHardware}
      onbeforesubmit={saveBeforeTranscribing}
    />
  {/if}
</div>
