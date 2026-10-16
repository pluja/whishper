<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { beforeNavigate } from "$app/navigation";
  import { pollWhileActive } from "$lib/browser/polling.svelte";
  import { CueEditor } from "$lib/editor/editor.svelte";
  import { PaneWidth } from "$lib/editor/pane-width.svelte";
  import {
    handleStudioKeydown,
    type StudioCommands,
  } from "$lib/editor/shortcuts";
  import { frameDurationUs } from "$lib/editor/transport.svelte";
  import { DEFAULT_MAX_LINE_LENGTH } from "$lib/shared/limits";
  import { isStudioActive } from "$lib/shared/project-status";
  import MediaMonitor from "$lib/studio/MediaMonitor.svelte";
  import ProcessingStatus from "$lib/studio/ProcessingStatus.svelte";
  import { editorCues, knownDurationUs } from "$lib/studio/project-view";
  import ShortcutGuide from "$lib/studio/ShortcutGuide.svelte";
  import StudioTitlebar from "$lib/studio/StudioTitlebar.svelte";
  import TranscriptPanel from "$lib/studio/TranscriptPanel.svelte";

  let { data, form } = $props();

  pollWhileActive(() => isStudioActive(data), 1_500);

  let shortcutGuideOpen = $state(false);
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
    isGuideOpen: () => shortcutGuideOpen,
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

<div class="project-editor-page">
  <StudioTitlebar
    project={data.project}
    track={data.track}
    derivativeKinds={data.derivatives.map((derivative) => derivative.kind)}
    cueCount={editor.cues.length}
    autosave={editor.autosave}
    onopenshortcuts={() => (shortcutGuideOpen = true)}
  />

  {#if form?.message}
    <div class="alert error" role="alert">{form.message}</div>
  {/if}

  <ProcessingStatus
    run={data.run}
    preparation={data.preparation}
    mediaPreparationStatus={data.project.mediaPreparationStatus}
  />
  <div
    class="editor-workspace"
    style:--editor-pane-width={`${paneWidth.width}px`}
  >
    <MediaMonitor
      project={data.project}
      track={data.track}
      derivatives={data.derivatives}
      {editor}
      onmediakeydown={onStudioKeydown}
    />

    <button
      class="studio-divider"
      type="button"
      aria-label="Resize subtitle panel with the left and right arrow keys"
      onpointerdown={paneWidth.beginResize}
      onkeydown={paneWidth.resizeWithKeyboard}
    >
      <span></span>
    </button>

    <TranscriptPanel
      {editor}
      track={data.track}
      run={data.run}
      hasSourceMedia={Boolean(data.project.mediaOriginalKey)}
      transcriptionModels={data.transcriptionModels}
      detectedHardware={data.detectedHardware}
    />
  </div>
  <ShortcutGuide bind:open={shortcutGuideOpen} />
</div>
