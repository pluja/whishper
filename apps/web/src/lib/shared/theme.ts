export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "anysub:theme";
export const THEME_CHANGE_EVENT = "anysub:themechange";

const PREFERENCES: readonly ThemePreference[] = ["light", "dark", "system"];

export function parseThemePreference(value: string | null): ThemePreference {
  return PREFERENCES.find((preference) => preference === value) ?? "system";
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}
