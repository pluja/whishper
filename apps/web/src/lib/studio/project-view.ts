import type { MediaDerivativeKind } from "@anysub/contracts";

import type { EditorCue } from "#lib/editor/cues.ts";
import { isRunActive } from "#lib/shared/project-status.ts";
import type { SubtitleCueSnapshot } from "#lib/shared/subtitles.ts";
import type { StudioData, StudioStatus } from "#lib/shared/studio-data.ts";

export function editorCues(cues: readonly SubtitleCueSnapshot[]): EditorCue[] {
  return cues.map((cue) => ({
    id: cue.id,
    position: cue.position,
    start_us: cue.startUs,
    end_us: cue.endUs,
    text: cue.text,
  }));
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

// Progress within a state is shown from the status alone; a new run or a
// changed state can bring a new track, derivatives or editing lock, so it
// reloads the whole studio.
export function processingStateChanged(
  previous: StudioStatus,
  next: StudioStatus,
): boolean {
  return (
    previous.run?.id !== next.run?.id ||
    previous.run?.status !== next.run?.status ||
    previous.preparation?.state !== next.preparation?.state
  );
}
