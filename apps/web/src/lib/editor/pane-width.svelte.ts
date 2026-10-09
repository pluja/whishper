const STORAGE_KEY = "anysub:editor-pane-width";
const STACKED_LAYOUT_MAX_WIDTH_PX = 928;
const KEYBOARD_STEP_PX = 24;

function clampPaneWidth(width: number): number {
  if (typeof window === "undefined") return width;
  return Math.min(
    Math.max(width, 360),
    Math.min(760, window.innerWidth * 0.52),
  );
}

export class PaneWidth {
  width = $state(500);
  #resizeController: AbortController | undefined;

  restore(): void {
    const storedWidth = window.localStorage.getItem(STORAGE_KEY);
    if (storedWidth === null) return;
    const parsedWidth = Number(storedWidth);
    if (Number.isFinite(parsedWidth)) this.width = clampPaneWidth(parsedWidth);
  }

  #persist(): void {
    window.localStorage.setItem(STORAGE_KEY, String(Math.round(this.width)));
  }

  beginResize = (event: PointerEvent): void => {
    if (window.innerWidth <= STACKED_LAYOUT_MAX_WIDTH_PX) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = this.width;
    const separator = event.currentTarget as HTMLElement;
    separator.setPointerCapture(event.pointerId);
    this.#resizeController?.abort();
    this.#resizeController = new AbortController();
    document.body.classList.add("resizing-studio-pane");

    window.addEventListener(
      "pointermove",
      (moveEvent) => {
        this.width = clampPaneWidth(startWidth + startX - moveEvent.clientX);
      },
      { signal: this.#resizeController.signal },
    );
    window.addEventListener(
      "pointerup",
      () => {
        this.#persist();
        document.body.classList.remove("resizing-studio-pane");
        this.#resizeController?.abort();
      },
      { once: true, signal: this.#resizeController.signal },
    );
  };

  resizeWithKeyboard = (event: KeyboardEvent): void => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    this.width = clampPaneWidth(
      this.width +
        (event.key === "ArrowLeft" ? KEYBOARD_STEP_PX : -KEYBOARD_STEP_PX),
    );
    this.#persist();
  };

  dispose(): void {
    this.#resizeController?.abort();
  }
}
