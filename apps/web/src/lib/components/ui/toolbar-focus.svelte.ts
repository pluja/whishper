import { nextMenuIndex } from "./menu-keyboard";

const MENU_KEYS: Record<string, string> = {
  ArrowLeft: "ArrowUp",
  ArrowRight: "ArrowDown",
  Home: "Home",
  End: "End",
};

// One tab stop for a toolbar's buttons, moved to an enabled button when the
// last focused one becomes disabled. With every button disabled there is none.
export class ToolbarFocus {
  element: HTMLElement | undefined;
  #focusedIndex = $state(0);
  readonly #disabled: () => readonly boolean[];

  tabStopIndex = $derived.by(() => {
    const disabled = this.#disabled();
    return disabled[this.#focusedIndex] === false
      ? this.#focusedIndex
      : disabled.indexOf(false);
  });

  constructor(disabled: () => readonly boolean[]) {
    this.#disabled = disabled;
  }

  tabIndex(index: number): 0 | -1 {
    return index === this.tabStopIndex ? 0 : -1;
  }

  #buttons(): HTMLButtonElement[] {
    return this.element ? [...this.element.querySelectorAll("button")] : [];
  }

  handleKeydown = (event: KeyboardEvent): void => {
    const key = MENU_KEYS[event.key];
    if (!key || event.altKey || event.ctrlKey || event.metaKey) return;
    const buttons = this.#buttons();
    const next = nextMenuIndex(
      buttons.indexOf(document.activeElement as HTMLButtonElement),
      key,
      buttons.map((button) => !button.disabled),
    );
    if (next === null) return;
    event.preventDefault();
    buttons[next].focus();
  };

  handleFocusIn = (event: FocusEvent): void => {
    const index = this.#buttons().indexOf(event.target as HTMLButtonElement);
    if (index >= 0) this.#focusedIndex = index;
  };
}
