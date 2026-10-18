import type { MediaDerivativeKind } from "@anysub/contracts";

import type { EditorCue } from "$lib/editor/cues";
import { isRunActive } from "$lib/shared/project-status";
import type { SubtitleCueSnapshot } from "$lib/shared/subtitles";
import type { StudioData } from "$lib/shared/studio-data";

export function editorCues(cues: readonly SubtitleCueSnapshot[]): EditorCue[] {
  return cues.map((cue) => ({
    id: cue.id,
    position: cue.position,
    start_us: cue.startUs,
    end_us: cue.endUs,
    text: cue.text,
  }));
}

// Zero stands for an unknown duration.
export function knownDurationUs(value: unknown): number {
  const durationUs = Number(value ?? 0);
  return Number.isSafeInteger(durationUs) && durationUs > 0 ? durationUs : 0;
}

export function derivativeUrl(
  derivatives: StudioData["derivatives"],
  kind: MediaDerivativeKind,
): string | null {
  return (
    derivatives.find((derivative) => derivative.kind === kind)?.url ?? null
  );
}

// A new run replaces the track when it finishes, so edits made meanwhile would be lost.
export function isEditingLocked(
  track: { id: string } | null,
  run: { status: string } | null,
): boolean {
  return track !== null && isRunActive(run);
}
