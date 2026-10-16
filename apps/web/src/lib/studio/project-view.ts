import type { MediaDerivativeKind } from "@anysub/contracts";

import type { EditorCue } from "$lib/editor/cues";
import type { SubtitleCueSnapshot } from "$lib/shared/subtitles";
import type { StudioData, StudioProject } from "./types";

const AUDIO_FILENAME = /\.(mp3|wav|m4a|aac|flac|ogg|opus)$/i;

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

export function isAudioSource(
  project: Pick<StudioProject, "mediaType" | "mediaFilename">,
): boolean {
  return (
    project.mediaType?.startsWith("audio/") === true ||
    AUDIO_FILENAME.test(project.mediaFilename ?? "")
  );
}
