<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import type { CueEditor } from "$lib/editor/editor.svelte";
  import { pluralize } from "$lib/shared/format";
  import { isRunActive } from "$lib/shared/project-status";
  import CueList from "./CueList.svelte";
  import EditorToolbar from "./EditorToolbar.svelte";
  import TranscribePanel from "./TranscribePanel.svelte";
  import type { StudioData } from "./types";

  type Props = {
    editor: CueEditor;
    track: StudioData["track"];
    run: StudioData["run"];
    hasSourceMedia: boolean;
    transcriptionModels: StudioData["transcriptionModels"];
    detectedHardware: StudioData["detectedHardware"];
  };

  let {
    editor,
    track,
    run,
    hasSourceMedia,
    transcriptionModels,
    detectedHardware,
  }: Props = $props();
</script>

<section class="transcript-panel" aria-label="Subtitle cues">
  <header class="panel-toolbar transcript-toolbar">
    <div>
      <span class="panel-kicker">Text</span>
      <strong>{track?.name ?? "Transcript"}</strong>
    </div>
    {#if track}
      <div class="track-summary">
        <span class="track-meta">
          {track.language} · {pluralize(editor.cues.length, "cue")}
        </span>
      </div>
    {/if}
  </header>

  {#if track}
    <EditorToolbar {editor} />
    <CueList
      {editor}
      activeCueId={editor.transport.activeCue?.id}
      onseek={editor.transport.seekTo}
    />
  {:else}
    <div class="transcript-empty">
      <span class="empty-illustration"><Icon name="subtitles" size={28} /></span
      >
      {#if isRunActive(run)}
        <h2>Preparing the first track</h2>
        <p>
          The worker will place normalized subtitle cues here when processing
          finishes.
        </p>
      {:else if hasSourceMedia}
        <h2>Ready to transcribe</h2>
        <TranscribePanel
          models={transcriptionModels}
          hardware={detectedHardware}
        />
      {:else}
        <h2>No subtitle track</h2>
        <p>This project does not have source media or a transcription run.</p>
      {/if}
    </div>
  {/if}
</section>
