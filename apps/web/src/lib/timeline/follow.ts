// "progress" is the playhead advancing during playback; "seek" is any
// deliberate jump (keyboard navigation, cue list, timeline click).
export type FollowTrigger = "progress" | "seek" | "play" | "manual-scroll";

export type FollowContext = {
  following: boolean;
  playing: boolean;
  panning: boolean;
};

export type FollowDecision = { following: boolean; reveal: boolean };

export function decideFollow(
  trigger: FollowTrigger,
  context: FollowContext,
): FollowDecision {
  switch (trigger) {
    case "seek":
      return { following: true, reveal: true };
    case "play":
      return { following: true, reveal: false };
    case "manual-scroll":
      return { following: false, reveal: false };
    case "progress":
      return {
        following: context.following,
        reveal: context.following && context.playing && !context.panning,
      };
  }
}

// While following playback, zoom keeps the playhead centred so it stays in
// view; otherwise zoom keeps whatever the user was looking at.
export function zoomAnchorUs(
  viewCentreUs: number,
  playheadUs: number,
  context: FollowContext,
): number {
  return context.playing && context.following ? playheadUs : viewCentreUs;
}
