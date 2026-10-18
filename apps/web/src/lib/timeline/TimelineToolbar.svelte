<script lang="ts">
  import IconButton from "$lib/components/ui/IconButton.svelte";
  import { ToolbarFocus } from "$lib/components/ui/toolbar-focus.svelte";
  import { formatEditorTime } from "$lib/shared/subtitles";

  type Props = {
    playbackUs: number;
    zoom: number;
    maxZoom: number;
    onzoom: (zoom: number) => void;
  };

  let { playbackUs, zoom, maxZoom, onzoom }: Props = $props();

  const fitDisabled = $derived(zoom === 1);
  const zoomOutDisabled = $derived(zoom <= 1);
  const zoomInDisabled = $derived(zoom >= maxZoom);
  const toolbarFocus = new ToolbarFocus(() => [
    fitDisabled,
    zoomOutDisabled,
    zoomInDisabled,
  ]);
</script>

<header
  class="flex min-w-0 items-center justify-between gap-2 border-b border-border bg-surface-raised pr-1 pl-3"
>
  <div class="flex min-w-0 items-center gap-3">
    <strong
      class="text-[0.6875rem] font-semibold tracking-wide text-text-muted uppercase"
      >Timeline</strong
    >
    <output
      class="font-mono text-xs text-text-muted tabular-nums max-sm:hidden"
      aria-label="Current playback time">{formatEditorTime(playbackUs)}</output
    >
  </div>
  <div
    bind:this={toolbarFocus.element}
    class="flex items-center gap-0.5"
    role="toolbar"
    aria-label="Timeline view"
    tabindex="-1"
    onkeydown={toolbarFocus.handleKeydown}
    onfocusin={toolbarFocus.handleFocusIn}
  >
    <IconButton
      label="Fit entire timeline"
      icon="fit-width"
      size="sm"
      tabindex={toolbarFocus.tabIndex(0)}
      disabled={fitDisabled}
      onclick={() => onzoom(1)}
    />
    <IconButton
      label="Zoom out"
      icon="zoom-out"
      size="sm"
      tabindex={toolbarFocus.tabIndex(1)}
      disabled={zoomOutDisabled}
      onclick={() => onzoom(zoom / 2)}
    />
    <span
      class="w-11 text-center font-mono text-xs text-text-muted tabular-nums max-sm:hidden"
      aria-live="polite">{Math.round(zoom * 100)}%</span
    >
    <IconButton
      label="Zoom in"
      icon="zoom-in"
      size="sm"
      tabindex={toolbarFocus.tabIndex(2)}
      disabled={zoomInDisabled}
      onclick={() => onzoom(zoom * 2)}
    />
  </div>
</header>
