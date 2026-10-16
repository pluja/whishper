<script lang="ts">
  import { formatEditorTime } from "$lib/shared/subtitles";

  type Props = {
    playbackUs: number;
    zoom: number;
    maxZoom: number;
    onzoom: (zoom: number) => void;
  };

  let { playbackUs, zoom, maxZoom, onzoom }: Props = $props();
</script>

<header class="timeline-toolbar">
  <div class="timeline-heading">
    <strong>Timeline</strong>
    <output aria-label="Current playback time"
      >{formatEditorTime(playbackUs)}</output
    >
  </div>
  <div class="timeline-controls" aria-label="Timeline view controls">
    <button
      type="button"
      onclick={() => onzoom(1)}
      disabled={zoom === 1}
      aria-label="Fit entire timeline">Fit</button
    >
    <button
      type="button"
      onclick={() => onzoom(zoom / 2)}
      disabled={zoom <= 1}
      aria-label="Zoom out">−</button
    >
    <span class="zoom-value" aria-live="polite">{Math.round(zoom * 100)}%</span>
    <button
      type="button"
      onclick={() => onzoom(zoom * 2)}
      disabled={zoom >= maxZoom}
      aria-label="Zoom in">+</button
    >
  </div>
</header>

<style>
  .timeline-toolbar {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding-inline: 0.65rem 0.4rem;
    border-block-end: 1px solid var(--waveform-border-soft);
    background: var(--waveform-raised);
  }

  .timeline-heading,
  .timeline-controls {
    display: flex;
    min-width: 0;
    align-items: center;
  }

  .timeline-heading {
    gap: 0.65rem;
  }

  .timeline-heading strong {
    color: var(--waveform-text-soft);
    font-size: 0.6875rem;
    font-weight: 650;
    letter-spacing: 0.025em;
    text-transform: uppercase;
  }

  .timeline-heading output,
  .zoom-value {
    color: var(--waveform-muted);
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 0.625rem;
    font-variant-numeric: tabular-nums;
  }

  .timeline-controls {
    gap: 0.2rem;
  }

  .timeline-controls button {
    min-width: 1.75rem;
    height: 1.6rem;
    border: 1px solid transparent;
    border-radius: 0.25rem;
    padding-inline: 0.42rem;
    background: transparent;
    color: var(--waveform-text-soft);
    cursor: pointer;
    font-size: 0.625rem;
    font-weight: 620;
  }

  .timeline-controls button:hover:not(:disabled) {
    border-color: var(--waveform-border);
    background: var(--waveform-hover);
    color: var(--waveform-text);
  }

  .timeline-controls button:focus-visible {
    z-index: 8;
    outline: 2px solid var(--waveform-accent);
    outline-offset: -2px;
  }

  .timeline-controls button:disabled {
    color: color-mix(in srgb, var(--waveform-muted) 48%, transparent);
    cursor: not-allowed;
  }

  .zoom-value {
    width: 2.5rem;
    text-align: center;
  }

  @media (max-width: 42rem) {
    .timeline-heading output,
    .zoom-value {
      display: none;
    }
  }
</style>
