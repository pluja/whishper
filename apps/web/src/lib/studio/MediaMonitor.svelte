<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import type { CueEditor } from "$lib/editor/editor.svelte";
  import { projectCaptionsUrl, projectMediaUrl } from "$lib/shared/routes";
  import Timeline from "$lib/timeline/Timeline.svelte";
  import { derivativeUrl, isAudioSource } from "./project-view";
  import type { StudioData } from "./types";

  type Props = {
    project: StudioData["project"];
    track: StudioData["track"];
    derivatives: StudioData["derivatives"];
    editor: CueEditor;
    onmediakeydown: (event: KeyboardEvent) => void;
  };

  let { project, track, derivatives, editor, onmediakeydown }: Props = $props();

  let transport = $derived(editor.transport);
  let proxyUrl = $derived(derivativeUrl(derivatives, "proxy"));
  let thumbnailUrl = $derived(derivativeUrl(derivatives, "thumbnail"));
  let waveformUrl = $derived(derivativeUrl(derivatives, "waveform"));
  let previewUrl = $derived(proxyUrl ?? projectMediaUrl(project.id));
</script>

<section class="media-panel" aria-label="Subtitle preview">
  <header class="panel-toolbar">
    <div>
      <span class="panel-kicker">Program monitor</span>
      <strong>{project.mediaFilename ?? "Diagnostic source"}</strong>
    </div>
    <span class="preview-state" data-state={project.mediaPreparationStatus}>
      <span></span>
      {proxyUrl
        ? "Editing proxy"
        : project.mediaPreparationStatus === "completed"
          ? "Source prepared"
          : editor.cues.length > 0
            ? "Track visible"
            : "Source stored"}
    </span>
  </header>

  <div class="media-canvas">
    {#if project.mediaOriginalKey}
      {#if isAudioSource(project)}
        <div class="audio-preview">
          <span><Icon name="audio" size={28} /></span>
          <strong>{project.mediaFilename}</strong>
          <audio
            bind:this={transport.mediaElement}
            controls
            preload="metadata"
            src={previewUrl}
            onkeydowncapture={onmediakeydown}
            {...transport.mediaEvents}
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
          onkeydowncapture={onmediakeydown}
          {...transport.mediaEvents}
        >
          <track
            kind="captions"
            srclang={track?.language ?? "und"}
            label={`${track?.language ?? "Source"} captions`}
            src={projectCaptionsUrl(project.id)}
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
    durationUs={transport.sourceDurationUs}
    probeState={project.mediaPreparationStatus}
    {waveformUrl}
    cues={editor.cues}
    selectedCueId={editor.selectedCueId}
    playbackUs={transport.playbackUs}
    playing={transport.playing}
    seekRevision={transport.seekRevision}
    onseek={transport.seekTo}
    onselect={(cueId) => editor.select(cueId)}
    oncommittiming={(timing, gesture) => editor.retime(timing, gesture)}
  />
</section>
