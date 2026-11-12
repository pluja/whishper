import { createContext } from "svelte";
import {
  parseThemePreference,
  resolveTheme,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from "#lib/shared/theme.ts";
import { readStorage, writeStorage } from "./safe-storage";

export const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";

export class ThemeController {
  preference = $state<ThemePreference>("system");
  resolved = $state<ResolvedTheme>("light");
  #media = window.matchMedia(SYSTEM_DARK_QUERY);
  #onSystemChange = () => this.#apply();

  constructor() {
    this.preference = parseThemePreference(readStorage(THEME_STORAGE_KEY));
    this.#media.addEventListener("change", this.#onSystemChange);
    this.#apply();
  }

  set(preference: ThemePreference): void {
    this.preference = preference;
    writeStorage(THEME_STORAGE_KEY, preference);
    this.#apply();
  }

  dispose(): void {
    this.#media.removeEventListener("change", this.#onSystemChange);
  }

  #apply(): void {
    const next = resolveTheme(this.preference, this.#media.matches);
    const changed = next !== this.resolved;
    this.resolved = next;
    document.documentElement.dataset.theme = next;
    if (changed) window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT));
  }
}

// A getter because the controller only exists after mount, once window is available.
export const [getThemeController, setThemeController] =
  createContext<() => ThemeController | undefined>();
