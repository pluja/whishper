import type { EditorCue } from "./cues";

type ShuttleDirection = -1 | 0 | 1;

type CueSelection = {
  readonly cues: EditorCue[];
  selectedCueId: string | null;
};

type TransportOptions = {
  frameDurationUs: () => number;
  sourceDurationUs: () => number;
};

const DEFAULT_FRAME_DURATION_US = 40_000;
const REVERSE_SHUTTLE_INTERVAL_MS = 40;
const CUE_SCROLL_OPTIONS: ScrollIntoViewOptions = { block: "nearest" };

function nextShuttleRate(rate: number): number {
  if (rate === 1) return 2;
  if (rate === 2) return 4;
  return 1;
}

export function frameDurationUs(
  frameRateNumerator: number | null,
  frameRateDenominator: number | null,
): number {
  const numerator = Number(frameRateNumerator);
  const denominator = Number(frameRateDenominator);
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    numerator <= 0 ||
    denominator <= 0
  ) {
    return DEFAULT_FRAME_DURATION_US;
  }
  return Math.round((1_000_000 * denominator) / numerator);
}

function scrollCueIntoView(cueId: string): void {
  document.getElementById(`cue-${cueId}`)?.scrollIntoView(CUE_SCROLL_OPTIONS);
}

export class Transport {
  playbackUs = $state(0);
  mediaDurationUs = $state(0);
  mediaElement = $state<HTMLMediaElement>();
  readonly #selection: CueSelection;
  readonly #options: TransportOptions;
  #reverseShuttleTimer: number | undefined;
  #reverseShuttleLastTickMs = 0;
  #shuttleDirection: ShuttleDirection = 0;
  #shuttleRate = 1;

  activeCue = $derived.by(() =>
    this.#selection.cues.find(
      (cue) => cue.start_us <= this.playbackUs && cue.end_us >= this.playbackUs,
    ),
  );

  constructor(selection: CueSelection, options: TransportOptions) {
    this.#selection = selection;
    this.#options = options;
  }

  updatePlayback = (event: Event): void => {
    const media = event.currentTarget as HTMLMediaElement;
    this.playbackUs = Math.round(media.currentTime * 1_000_000);
    this.mediaDurationUs = Number.isFinite(media.duration)
      ? Math.round(media.duration * 1_000_000)
      : 0;
    const current = this.#selection.cues.find(
      (cue) => cue.start_us <= this.playbackUs && cue.end_us >= this.playbackUs,
    );
    if (
      current &&
      current.id !== this.#selection.selectedCueId &&
      !document.activeElement?.closest(".cue-editor")
    ) {
      this.#selection.selectedCueId = current.id;
      scrollCueIntoView(current.id);
    }
  };

  seekTo = (microseconds: number): void => {
    if (!this.mediaElement) return;
    this.mediaElement.currentTime = microseconds / 1_000_000;
    this.playbackUs = Math.round(microseconds);
  };

  #currentPlayheadUs(): number {
    if (!this.mediaElement || !Number.isFinite(this.mediaElement.currentTime)) {
      return this.playbackUs;
    }
    return Math.round(this.mediaElement.currentTime * 1_000_000);
  }

  #playbackEndUs(): number {
    const media = this.mediaElement;
    if (media && Number.isFinite(media.duration) && media.duration > 0) {
      return Math.round(media.duration * 1_000_000);
    }
    return this.#options.sourceDurationUs();
  }

  #clearReverseShuttleTimer(): void {
    if (this.#reverseShuttleTimer === undefined) return;
    window.clearInterval(this.#reverseShuttleTimer);
    this.#reverseShuttleTimer = undefined;
  }

  resetShuttleRate(): void {
    this.#clearReverseShuttleTimer();
    this.#shuttleDirection = 0;
    this.#shuttleRate = 1;
    if (this.mediaElement) this.mediaElement.playbackRate = 1;
  }

  #pauseAndResetPlayback(): boolean {
    if (!this.mediaElement) return false;
    this.resetShuttleRate();
    this.mediaElement.pause();
    return true;
  }

  #setPausedPlayhead(microseconds: number): boolean {
    if (!this.mediaElement) return false;
    this.#pauseAndResetPlayback();
    const endUs = this.#playbackEndUs();
    const boundedUs = Math.max(
      0,
      endUs > 0
        ? Math.min(Math.round(microseconds), endUs)
        : Math.round(microseconds),
    );
    this.mediaElement.currentTime = boundedUs / 1_000_000;
    this.playbackUs = boundedUs;
    return true;
  }

  #stepReverseShuttle(): void {
    if (!this.mediaElement || this.#reverseShuttleTimer === undefined) {
      this.resetShuttleRate();
      return;
    }
    const now = performance.now();
    const elapsedMs = Math.max(0, now - this.#reverseShuttleLastTickMs);
    this.#reverseShuttleLastTickMs = now;
    const nextUs = Math.max(
      0,
      this.#currentPlayheadUs() -
        Math.round(elapsedMs * 1_000 * this.#shuttleRate),
    );
    this.mediaElement.currentTime = nextUs / 1_000_000;
    this.playbackUs = nextUs;
    if (nextUs === 0) {
      this.mediaElement.pause();
      this.resetShuttleRate();
    }
  }

  togglePlayback(): boolean {
    if (!this.mediaElement) return false;
    const wasPlaying =
      this.#reverseShuttleTimer !== undefined || !this.mediaElement.paused;
    this.resetShuttleRate();
    if (wasPlaying) {
      this.mediaElement.pause();
    } else {
      void this.mediaElement.play();
    }
    return true;
  }

  playForwardAtNormalRate(): boolean {
    if (!this.mediaElement) return false;
    this.resetShuttleRate();
    void this.mediaElement.play();
    return true;
  }

  startReverseShuttle(): boolean {
    if (!this.mediaElement) return false;
    this.#shuttleRate =
      this.#shuttleDirection === -1 ? nextShuttleRate(this.#shuttleRate) : 1;
    this.#shuttleDirection = -1;
    this.#clearReverseShuttleTimer();
    this.mediaElement.pause();
    this.mediaElement.playbackRate = 1;
    this.playbackUs = this.#currentPlayheadUs();
    if (this.playbackUs <= 0) {
      this.playbackUs = 0;
      this.mediaElement.currentTime = 0;
      this.resetShuttleRate();
      return true;
    }
    this.#reverseShuttleLastTickMs = performance.now();
    this.#reverseShuttleTimer = window.setInterval(
      () => this.#stepReverseShuttle(),
      REVERSE_SHUTTLE_INTERVAL_MS,
    );
    return true;
  }

  startForwardShuttle(): boolean {
    if (!this.mediaElement) return false;
    this.#shuttleRate =
      this.#shuttleDirection === 1 ? nextShuttleRate(this.#shuttleRate) : 1;
    this.#shuttleDirection = 1;
    this.#clearReverseShuttleTimer();
    this.mediaElement.playbackRate = this.#shuttleRate;
    void this.mediaElement.play();
    return true;
  }

  stepFrames(direction: -1 | 1, frameCount: number): boolean {
    if (!this.mediaElement) return false;
    return this.#setPausedPlayhead(
      this.#currentPlayheadUs() +
        direction * frameCount * this.#options.frameDurationUs(),
    );
  }

  jumpToCueStart(direction: -1 | 1): boolean {
    if (!this.mediaElement) return false;
    const playheadUs = this.#currentPlayheadUs();
    let destination: EditorCue | undefined;
    for (const cue of this.#selection.cues) {
      if (
        direction === -1 &&
        cue.start_us < playheadUs &&
        (!destination || cue.start_us > destination.start_us)
      ) {
        destination = cue;
      } else if (
        direction === 1 &&
        cue.start_us > playheadUs &&
        (!destination || cue.start_us < destination.start_us)
      ) {
        destination = cue;
      }
    }
    if (!destination) return false;
    this.#setPausedPlayhead(destination.start_us);
    this.#selection.selectedCueId = destination.id;
    scrollCueIntoView(destination.id);
    return true;
  }

  goToSourceEdge(end: boolean): boolean {
    if (!this.mediaElement) return false;
    if (!end) return this.#setPausedPlayhead(0);
    const endUs = this.#playbackEndUs();
    return endUs > 0 && this.#setPausedPlayhead(endUs);
  }
}
