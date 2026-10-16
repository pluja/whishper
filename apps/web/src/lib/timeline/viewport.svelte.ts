import { tick, untrack } from "svelte";

import { decideFollow, zoomAnchorUs, type FollowTrigger } from "./follow";
import {
  clampInteger,
  clampNumber,
  pxToTime,
  scrollLeftCentredOn,
  scrollLeftRevealing,
} from "./math";
import {
  capturePointer,
  isCapturedPointer,
  releasePointer,
  type PointerCapture,
} from "./pointer-drag";

export const MAX_ZOOM = 64;
const PLAYHEAD_GUTTER_PX = 5;
const WHEEL_LINE_PX = 16;
const PAN_THRESHOLD_PX = 3;
// Browsers may round a programmatic scrollLeft by a fraction of a pixel.
const SCROLL_ECHO_TOLERANCE_PX = 1;

type PanDrag = PointerCapture & {
  originClientX: number;
  originScrollLeft: number;
  moved: boolean;
};

type ViewportPlayback = {
  durationUs: () => number;
  playbackUs: () => number;
  playing: () => boolean;
  seekRevision: () => number;
  seek: (microseconds: number) => void;
};

export class TimelineViewport {
  element = $state<HTMLDivElement>();
  width = $state(0);
  scrollLeft = $state(0);
  zoom = $state(1);
  #pan = $state.raw<PanDrag | null>(null);
  #following = true;
  #lastAutoScrollLeft = 0;
  #handledSeekRevision = 0;
  readonly #playback: ViewportPlayback;

  contentWidthPx = $derived(
    Math.max(1, this.width, Math.round(this.width * this.zoom)),
  );
  panning = $derived(this.#pan?.moved ?? false);

  constructor(playback: ViewportPlayback) {
    this.#playback = playback;

    $effect(() => {
      if (playback.playing()) untrack(() => this.#follow("play"));
    });

    // Zoom and resize are deliberately not triggers: only playback progress
    // and explicit seeks may move the view to the playhead.
    $effect(() => {
      playback.playbackUs();
      untrack(() => this.#follow("progress"));
    });

    $effect(() => {
      const revision = playback.seekRevision();
      if (revision === this.#handledSeekRevision) return;
      this.#handledSeekRevision = revision;
      untrack(() => this.#follow("seek"));
    });
  }

  #followContext() {
    return {
      following: this.#following,
      playing: this.#playback.playing(),
      panning: this.#pan !== null,
    };
  }

  #follow(trigger: FollowTrigger): void {
    const decision = decideFollow(trigger, this.#followContext());
    this.#following = decision.following;
    if (decision.reveal) this.#revealPlayhead();
  }

  #geometry() {
    return {
      durationUs: this.#playback.durationUs(),
      contentWidthPx: this.contentWidthPx,
      viewportWidthPx: this.width,
    };
  }

  #scrollTo(node: HTMLDivElement, target: number): void {
    if (node.scrollLeft !== target) node.scrollLeft = target;
    this.#lastAutoScrollLeft = node.scrollLeft;
  }

  #revealPlayhead(): void {
    const node = this.element;
    if (!node || this.#playback.durationUs() <= 0 || this.width <= 0) return;
    this.#scrollTo(
      node,
      scrollLeftRevealing(
        this.#playback.playbackUs(),
        node.scrollLeft,
        PLAYHEAD_GUTTER_PX,
        this.#geometry(),
      ),
    );
  }

  #positionFromClientX(clientX: number): number {
    const durationUs = this.#playback.durationUs();
    if (!this.element || durationUs <= 0) return 0;
    const bounds = this.element.getBoundingClientRect();
    const contentX = this.element.scrollLeft + clientX - bounds.left;
    return clampInteger(
      pxToTime(contentX, durationUs, this.contentWidthPx),
      0,
      durationUs,
    );
  }

  handleScroll = (): void => {
    if (!this.element) return;
    this.scrollLeft = this.element.scrollLeft;
    const manual =
      Math.abs(this.scrollLeft - this.#lastAutoScrollLeft) >
      SCROLL_ECHO_TOLERANCE_PX;
    this.#lastAutoScrollLeft = this.scrollLeft;
    if (manual) this.#follow("manual-scroll");
  };

  beginPan = (event: PointerEvent): void => {
    if (
      event.button !== 0 ||
      !this.element ||
      this.#playback.durationUs() <= 0
    ) {
      return;
    }
    event.preventDefault();
    this.#pan = {
      ...capturePointer(event),
      originClientX: event.clientX,
      originScrollLeft: this.element.scrollLeft,
      moved: false,
    };
  };

  movePan = (event: PointerEvent): void => {
    const active = this.#pan;
    if (!isCapturedPointer(active, event) || !this.element) return;
    event.preventDefault();
    const distance = event.clientX - active.originClientX;
    const moved = active.moved || Math.abs(distance) >= PAN_THRESHOLD_PX;
    this.element.scrollLeft = active.originScrollLeft - distance;
    if (moved !== active.moved) this.#pan = { ...active, moved };
  };

  finishPan = (event: PointerEvent): void => {
    const active = this.#pan;
    if (!isCapturedPointer(active, event)) return;
    event.preventDefault();
    releasePointer(active);
    this.#pan = null;
    if (!active.moved) {
      this.#playback.seek(this.#positionFromClientX(event.clientX));
    }
  };

  cancelPan = (event?: Event): void => {
    const active = this.#pan;
    if (!active) return;
    event?.preventDefault();
    event?.stopPropagation();
    releasePointer(active);
    this.#pan = null;
  };

  setZoom = async (nextZoom: number): Promise<void> => {
    const node = this.element;
    const durationUs = this.#playback.durationUs();
    if (!node || this.width <= 0 || durationUs <= 0) return;
    const targetZoom = clampNumber(nextZoom, 1, MAX_ZOOM);
    if (targetZoom === this.zoom) return;

    const viewCentreUs = clampNumber(
      pxToTime(
        node.scrollLeft + node.clientWidth / 2,
        durationUs,
        this.contentWidthPx,
      ),
      0,
      durationUs,
    );
    const anchorUs = zoomAnchorUs(
      viewCentreUs,
      this.#playback.playbackUs(),
      this.#followContext(),
    );
    this.zoom = targetZoom;
    await tick();

    if (this.element !== node || node.clientWidth <= 0) return;
    this.#scrollTo(node, scrollLeftCentredOn(anchorUs, this.#geometry()));
  };

  handleWheel = (event: WheelEvent): void => {
    const node = this.element;
    if (!node || event.ctrlKey) return;

    let delta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      delta *= WHEEL_LINE_PX;
    } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      delta *= node.clientWidth;
    }
    if (!Number.isFinite(delta) || delta === 0) return;

    const maxScrollLeft = node.scrollWidth - node.clientWidth;
    if (maxScrollLeft <= 0) return;

    const targetScrollLeft = clampNumber(
      node.scrollLeft + delta,
      0,
      maxScrollLeft,
    );
    if (targetScrollLeft === node.scrollLeft) return;

    event.preventDefault();
    node.scrollLeft = targetScrollLeft;
  };
}
