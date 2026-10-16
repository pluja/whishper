import type {
  MediaDerivativeKind,
  MediaProbeArtifact,
  MediaRational,
} from "@anysub/contracts";

export function requiredArtifactKinds(
  probe: MediaProbeArtifact,
): MediaDerivativeKind[] {
  const kinds: MediaDerivativeKind[] = [];
  if (probe.streams.some((stream) => stream.type === "audio"))
    kinds.push("waveform");
  if (
    probe.streams.some(
      (stream) => stream.type === "video" && !stream.video?.attachedPicture,
    )
  ) {
    kinds.push("thumbnail");
  }
  if (probe.proxyRecommended) kinds.push("proxy");
  return kinds;
}

export function primaryFrameRate(
  probe: MediaProbeArtifact,
): MediaRational | null {
  for (const stream of probe.streams) {
    if (stream.type !== "video" || stream.video?.attachedPicture) continue;
    const frameRate = stream.video?.averageFrameRate ?? stream.video?.frameRate;
    if (frameRate) return frameRate;
  }
  return null;
}
