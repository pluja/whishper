<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import type { CueEditor } from "$lib/editor/editor.svelte";
  import { pluralize } from "$lib/shared/format";
  import { isRunActive } from "$lib/shared/project-status";
  import { isEditingLocked } from "./project-view";
  import CueList from "./CueList.svelte";
  import EditorToolbar from "./EditorToolbar.svelte";
  import JournalNotice from "./JournalNotice.svelte";
  import ProcessingStatus from "./ProcessingStatus.svelte";
  import TranscribePanel from "./TranscribePanel.svelte";
  import type { StudioData } from "$lib/shared/studio-data";

  type Props = {
    editor: CueEditor;
    track: StudioData["track"];
    run: StudioData["run"];
    preparation: StudioData["preparation"];
    mediaPreparationStatus: StudioData["project"]["mediaPreparationStatus"];
    hasSourceMedia: boolean;
    transcriptionModels: StudioData["transcriptionModels"];
    detectedHardware: StudioData["detectedHardware"];
  };

  let {
    editor,
    track,
    run,
    preparation,
    mediaPreparationStatus,
    hasSourceMedia,
    transcriptionModels,
    detectedHardware,
  }: Props = $props();
</script>

<section
  class="flex h-[42rem] max-h-[85dvh] min-w-0 flex-col border-t border-border bg-surface lg:h-auto lg:max-h-none lg:min-h-0 lg:border-t-0 lg:border-l"
  aria-label="Subtitle cues"
>
  <header
    class="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-border px-4"
  >
    <h2 class="truncate text-sm font-semibold text-text">
      {track?.name ?? "Transcript"}
    </h2>
    {#if track}
      <span class="shrink-0 text-xs text-text-muted">
        {track.language.toUpperCase()} · {pluralize(editor.cues.length, "cue")}
      </span>
    {/if}
  </header>

  <JournalNotice autosave={editor.autosave} />
  <ProcessingStatus {run} {preparation} {mediaPreparationStatus} />
  <!-- Always mounted, so screen readers announce the lock when it starts. -->
  <div role="status" class="shrink-0">
    {#if isEditingLocked(track, run)}
      <p
        class="border-b border-border bg-accent-soft px-4 py-2 text-sm text-text"
      >
        A new transcription is running. Editing resumes when it finishes or you
        cancel it.
      </p>
    {/if}
  </div>

  {#if track}
    <EditorToolbar {editor} />
    <div class="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)]">
      <CueList {editor} />
    </div>
  {:else}
    <div class="min-h-0 flex-1 overflow-y-auto px-5 py-6">
      <div class="mx-auto grid max-w-md gap-4">
        <div class="grid justify-items-start gap-2">
          <span
            class="grid size-10 place-items-center rounded-md bg-accent-soft text-accent"
            aria-hidden="true"
          >
            <Icon name="subtitles" size={20} />
          </span>
          {#if isRunActive(run)}
            <h3 class="text-base font-semibold text-text">
              Preparing the first track
            </h3>
            <p class="text-sm text-text-muted">
              The worker will place normalized subtitle cues here when
              processing finishes.
            </p>
          {:else if hasSourceMedia}
            <h3 class="text-base font-semibold text-text">
              Ready to transcribe
            </h3>
          {:else}
            <h3 class="text-base font-semibold text-text">No subtitle track</h3>
            <p class="text-sm text-text-muted">
              This project does not have source media or a transcription run.
            </p>
          {/if}
        </div>
        {#if !isRunActive(run) && hasSourceMedia}
          <TranscribePanel
            models={transcriptionModels}
            hardware={detectedHardware}
          />
        {/if}
      </div>
    </div>
  {/if}
</section>
