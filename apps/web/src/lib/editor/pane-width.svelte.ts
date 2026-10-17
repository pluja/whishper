import { innerWidth } from "svelte/reactivity/window";
import { readStorage, writeStorage } from "$lib/browser/safe-storage";

const STORAGE_KEY = "anysub:editor-pane-width";
// Matches Tailwind's lg breakpoint, below which the studio stacks its panes.
const SIDE_BY_SIDE_MIN_VIEWPORT_PX = 1024;
const KEYBOARD_STEP_PX = 24;
const MIN_WIDTH_PX = 360;
const MAX_WIDTH_PX = 760;
const MAX_VIEWPORT_SHARE = 0.52;

export class PaneWidth {
  readonly min = MIN_WIDTH_PX;
  width = $state(500);
  #resizeController: AbortController | undefined;

  get max(): number {
    const viewportWidth = innerWidth.current;
    return viewportWidth === undefined
      ? MAX_WIDTH_PX
      : Math.round(Math.min(MAX_WIDTH_PX, viewportWidth * MAX_VIEWPORT_SHARE));
  }

  get value(): number {
    return Math.round(this.width);
  }

  #clamp(width: number): number {
    return Math.min(Math.max(width, this.min), this.max);
  }

  restore(): void {
    const storedWidth = readStorage(STORAGE_KEY);
    if (storedWidth === null) return;
    const parsedWidth = Number(storedWidth);
    if (Number.isFinite(parsedWidth)) this.width = this.#clamp(parsedWidth);
  }

  #persist(): void {
    writeStorage(STORAGE_KEY, String(this.value));
  }

  beginResize = (event: PointerEvent): void => {
    if (window.innerWidth < SIDE_BY_SIDE_MIN_VIEWPORT_PX) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = this.width;
    const separator = event.currentTarget as HTMLElement;
    separator.setPointerCapture(event.pointerId);
    this.#resizeController?.abort();
    this.#resizeController = new AbortController();
    document.body.classList.add("resizing-studio-pane");
    const signal = this.#resizeController.signal;

    window.addEventListener(
      "pointermove",
      (moveEvent) => {
        this.width = this.#clamp(startWidth + startX - moveEvent.clientX);
      },
      { signal },
    );
    const finishResize = () => {
      this.#persist();
      this.#endResize();
    };
    window.addEventListener("pointerup", finishResize, { signal });
    window.addEventListener("pointercancel", finishResize, { signal });
    separator.addEventListener("lostpointercapture", finishResize, { signal });
  };

  resizeWithKeyboard = (event: KeyboardEvent): void => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    this.width = this.#clamp(
      this.width +
        (event.key === "ArrowLeft" ? KEYBOARD_STEP_PX : -KEYBOARD_STEP_PX),
    );
    this.#persist();
  };

  #endResize(): void {
    document.body.classList.remove("resizing-studio-pane");
    this.#resizeController?.abort();
  }

  dispose(): void {
    this.#endResize();
  }
}
