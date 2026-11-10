<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import IconButton from "$lib/components/ui/IconButton.svelte";
  import type { CueEditor } from "$lib/editor/editor.svelte";
  import { projectCaptionsUrl, projectMediaUrl } from "$lib/shared/routes";
  import { isAudioMedia } from "$lib/shared/media";
  import { formatEditorTime } from "$lib/shared/subtitles";
  import { derivativeUrl } from "./project-view";
  import type { StudioData } from "$lib/shared/studio-data";

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
  let previewUrl = $derived(proxyUrl ?? projectMediaUrl(project.id));
  let isVideo = $derived(
    project.hasSourceMedia &&
      !isAudioMedia(project.mediaType, project.mediaFilename),
  );
  let noMedia = $derived(!transport.mediaElement);
  let videoAspectRatio = $state(16 / 9);
  let previewState = $derived(
    proxyUrl
      ? "Editing proxy"
      : project.mediaPreparationStatus === "completed"
        ? "Source prepared"
        : editor.cues.length > 0
          ? "Track visible"
          : "Source stored",
  );
</script>

<section
  class="flex min-w-0 flex-col bg-surface lg:min-h-0"
  aria-label="Subtitle preview"
>
  <div
    class="relative grid place-items-center overflow-hidden lg:min-h-0 lg:flex-1 {isVideo
      ? 'aspect-video bg-black [container-type:size] lg:aspect-auto'
      : 'bg-surface-sunken py-8'}"
  >
    {#if !project.hasSourceMedia}
      <div class="grid justify-items-center gap-3 text-text-muted">
        <span
          class="grid size-12 place-items-center rounded-full border border-border bg-surface"
          aria-hidden="true"
        >
          <Icon name="play" size={22} />
        </span>
        <p class="text-sm">No source media is attached</p>
      </div>
    {:else if isVideo}
      <!-- Sized to the picture so the controls and the cue overlay sit on it rather than on letterboxing. -->
      <div
        class="relative"
        style:aspect-ratio={videoAspectRatio}
        style:width={`min(100cqw, ${videoAspectRatio * 100}cqh)`}
      >
        <video
          bind:this={transport.mediaElement}
          class="size-full object-contain"
          onloadedmetadata={(event) => {
            const { videoWidth, videoHeight } = event.currentTarget;
            if (videoWidth > 0 && videoHeight > 0) {
              videoAspectRatio = videoWidth / videoHeight;
            }
          }}
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
        {#if transport.activeCue}
          <p
            class="pointer-events-none absolute inset-x-[10%] bottom-[max(12%,4.5rem)] text-center text-base leading-relaxed font-semibold text-white lg:text-lg"
          >
            <span
              class="rounded bg-black/75 px-2 py-0.5 whitespace-pre-line box-decoration-clone"
              >{transport.activeCue.text}</span
            >
          </p>
        {/if}
      </div>
    {:else}
      <div class="grid w-full max-w-md justify-items-center gap-3 px-6">
        <span
          class="grid size-14 place-items-center rounded-full border border-border bg-surface text-text-muted"
          aria-hidden="true"
        >
          <Icon name="audio" size={26} />
        </span>
        <p class="max-w-full truncate text-sm font-medium text-text">
          {project.mediaFilename}
        </p>
        <audio
          bind:this={transport.mediaElement}
          class="w-full"
          controls
          preload="metadata"
          src={previewUrl}
          onkeydowncapture={onmediakeydown}
          {...transport.mediaEvents}
        ></audio>
        <p class="min-h-14 text-center text-base font-semibold text-text">
          <span class="whitespace-pre-line"
            >{transport.activeCue?.text ?? ""}</span
          >
        </p>
      </div>
    {/if}
  </div>

  <div
    class="grid h-12 shrink-0 grid-cols-[auto_1fr] items-center gap-3 border-t border-border px-3 sm:grid-cols-[1fr_auto_1fr]"
  >
    <span class="truncate font-mono text-sm text-text tabular-nums">
      <span class="sr-only">Playback time</span>
      {formatEditorTime(transport.playbackUs)}
      <span class="text-text-muted max-xl:hidden">
        / {formatEditorTime(transport.sourceDurationUs)}
      </span>
    </span>
    <div
      class="flex items-center gap-0.5 justify-self-end sm:justify-self-auto"
      role="group"
      aria-label="Transport"
    >
      <IconButton
        label="Previous cue"
        icon="skip-back"
        size="sm"
        disabled={noMedia}
        onclick={() => transport.jumpToCueStart(-1)}
      />
      <IconButton
        label="Back one frame"
        icon="chevron-left"
        size="sm"
        disabled={noMedia}
        onclick={() => transport.stepFrames(-1, 1)}
      />
      <IconButton
        label={transport.playing ? "Pause" : "Play"}
        icon={transport.playing ? "pause" : "play"}
        variant="secondary"
        disabled={noMedia}
        onclick={() => transport.togglePlayback()}
      />
      <IconButton
        label="Forward one frame"
        icon="chevron-right"
        size="sm"
        disabled={noMedia}
        onclick={() => transport.stepFrames(1, 1)}
      />
      <IconButton
        label="Next cue"
        icon="skip-forward"
        size="sm"
        disabled={noMedia}
        onclick={() => transport.jumpToCueStart(1)}
      />
    </div>
    <span class="truncate text-right text-xs text-text-muted max-sm:hidden">
      {previewState}
    </span>
  </div>
</section>
