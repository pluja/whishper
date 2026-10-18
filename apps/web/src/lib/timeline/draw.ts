import { formatClock } from "$lib/shared/format";

import { clampInteger } from "./math";
import type { DecodedWaveformLevel } from "./waveform";

export const TRACK_HEIGHT = 124;
const RULER_HEIGHT = 25;
const WAVEFORM_TOP = 27;
const WAVEFORM_BOTTOM = 83;
const MAJOR_TICK_SPACING_PX = 80;

export type TimelineFrame = {
  canvas: HTMLCanvasElement;
  themeSource: HTMLElement;
  viewportWidthPx: number;
  scrollLeft: number;
  durationUs: number;
  contentWidthPx: number;
  level: DecodedWaveformLevel | null;
};

type Palette = {
  ruler: string;
  line: string;
  waveform: string;
  baseline: string;
};

const NEUTRAL_COLOR = "#808080";

function themeColor(styles: CSSStyleDeclaration, token: string): string {
  return styles.getPropertyValue(`--theme-${token}`).trim() || NEUTRAL_COLOR;
}

function readPalette(themeSource: HTMLElement): Palette {
  const styles = getComputedStyle(themeSource);
  return {
    ruler: themeColor(styles, "text-muted"),
    line: themeColor(styles, "border-strong"),
    waveform: themeColor(styles, "accent"),
    baseline: themeColor(styles, "border"),
  };
}

export function rulerStepUs(targetUs: number): number {
  if (!Number.isFinite(targetUs) || targetUs <= 1_000) return 1_000;
  const magnitude = 10 ** Math.floor(Math.log10(targetUs));
  const normalized = targetUs / magnitude;
  const multiplier =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return Math.max(1_000, Math.round(multiplier * magnitude));
}

type VisibleRange = {
  startUs: number;
  endUs: number;
  pixelsPerUs: number;
  offset: number;
};

function drawRuler(
  context: CanvasRenderingContext2D,
  range: VisibleRange,
  palette: Palette,
): void {
  const { startUs, endUs, pixelsPerUs, offset } = range;
  const majorStepUs = rulerStepUs(MAJOR_TICK_SPACING_PX / pixelsPerUs);
  const firstMajorUs = Math.ceil(startUs / majorStepUs) * majorStepUs;

  context.fillStyle = palette.ruler;
  context.strokeStyle = palette.line;
  context.font = '10px ui-monospace, "SFMono-Regular", monospace';
  context.textBaseline = "top";
  context.beginPath();
  for (let tickUs = firstMajorUs; tickUs <= endUs; tickUs += majorStepUs) {
    const x = Math.round(tickUs * pixelsPerUs - offset) + 0.5;
    context.moveTo(x, 15);
    context.lineTo(x, RULER_HEIGHT);
    context.fillText(formatClock(Math.floor(tickUs / 1_000_000)), x + 4, 3);
  }
  context.stroke();

  const halfStepUs = majorStepUs / 2;
  if (!Number.isInteger(halfStepUs)) return;
  const firstMinorUs = Math.ceil(startUs / halfStepUs) * halfStepUs;
  context.beginPath();
  for (let tickUs = firstMinorUs; tickUs <= endUs; tickUs += halfStepUs) {
    if (tickUs % majorStepUs === 0) continue;
    const x = Math.round(tickUs * pixelsPerUs - offset) + 0.5;
    context.moveTo(x, 20);
    context.lineTo(x, RULER_HEIGHT);
  }
  context.stroke();
}

function drawPeaks(
  context: CanvasRenderingContext2D,
  range: VisibleRange,
  level: DecodedWaveformLevel,
  centerY: number,
  color: string,
): void {
  const pixelsPerSecond = range.pixelsPerUs * 1_000_000;
  const firstPeak = Math.max(
    0,
    Math.floor((range.startUs * level.peaksPerSecond) / 1_000_000) - 1,
  );
  const lastPeak = Math.min(
    level.length - 1,
    Math.ceil((range.endUs * level.peaksPerSecond) / 1_000_000) + 1,
  );
  const amplitude = (WAVEFORM_BOTTOM - WAVEFORM_TOP - 5) / 2;
  const peakWidth = Math.max(1, pixelsPerSecond / level.peaksPerSecond);

  context.strokeStyle = color;
  context.lineWidth = Math.min(2, peakWidth);
  context.beginPath();
  for (let index = firstPeak; index <= lastPeak; index += 1) {
    const x = (index / level.peaksPerSecond) * pixelsPerSecond - range.offset;
    const minimum = level.peaks[index * 2] / 128;
    const maximum = level.peaks[index * 2 + 1] / 127;
    context.moveTo(x, centerY - maximum * amplitude);
    context.lineTo(x, centerY - minimum * amplitude);
  }
  context.stroke();
}

export function drawTimeline(frame: TimelineFrame): void {
  const { canvas, viewportWidthPx: width, durationUs } = frame;
  const dpr = window.devicePixelRatio || 1;
  const pixelWidth = Math.max(1, Math.round(width * dpr));
  const pixelHeight = Math.round(TRACK_HEIGHT * dpr);
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;

  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, TRACK_HEIGHT);

  const palette = readPalette(frame.themeSource);
  context.strokeStyle = palette.line;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, RULER_HEIGHT + 0.5);
  context.lineTo(width, RULER_HEIGHT + 0.5);
  context.stroke();

  if (durationUs <= 0) return;

  const pixelsPerUs = frame.contentWidthPx / durationUs;
  const offset = frame.scrollLeft;
  const range: VisibleRange = {
    startUs: clampInteger(Math.floor(offset / pixelsPerUs), 0, durationUs),
    endUs: clampInteger(
      Math.ceil((offset + width) / pixelsPerUs),
      0,
      durationUs,
    ),
    pixelsPerUs,
    offset,
  };
  drawRuler(context, range, palette);

  const centerY = (WAVEFORM_TOP + WAVEFORM_BOTTOM) / 2;
  context.strokeStyle = palette.baseline;
  context.beginPath();
  context.moveTo(0, centerY + 0.5);
  context.lineTo(width, centerY + 0.5);
  context.stroke();

  if (frame.level) {
    drawPeaks(context, range, frame.level, centerY, palette.waveform);
  }
}
