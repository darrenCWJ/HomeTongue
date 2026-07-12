/**
 * Theme preference: light / dark / system.
 *
 * - Persisted in localStorage under "ht_theme".
 * - Applies/removes the `.dark` class on <html> (theme.css keys all semantic
 *   tokens off that class via `@custom-variant dark`).
 * - When set to "system", follows prefers-color-scheme live.
 * - Default is "light" (NOT "system") so existing users see zero change
 *   until they opt in from Profile > Appearance.
 *
 * initTheme() must run in src/main.tsx BEFORE React mounts so the first
 * paint already has the right class (no flash of the wrong theme).
 */

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "ht_theme";
const DEFAULT_THEME: ThemePreference = "light";
const VALID_THEMES: readonly ThemePreference[] = ["light", "dark", "system"];

type ThemeListener = () => void;
const listeners = new Set<ThemeListener>();

function isThemePreference(value: string | null): value is ThemePreference {
  return value !== null && (VALID_THEMES as readonly string[]).includes(value);
}

/** Read the stored preference; falls back to "light" on absence or bad data. */
export function getTheme(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isThemePreference(stored) ? stored : DEFAULT_THEME;
  } catch {
    // localStorage can throw (e.g. blocked storage); degrade to the default.
    return DEFAULT_THEME;
  }
}

function systemPrefersDark(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/** The theme actually in effect ("system" resolved against the OS setting). */
export function getResolvedTheme(): ResolvedTheme {
  const preference = getTheme();
  if (preference === "system") return systemPrefersDark() ? "dark" : "light";
  return preference;
}

function applyResolvedTheme(): void {
  document.documentElement.classList.toggle("dark", getResolvedTheme() === "dark");
}

function notifyListeners(): void {
  for (const listener of listeners) listener();
}

/** Persist a new preference and apply it immediately. */
export function setTheme(theme: ThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Persistence failed (e.g. private mode); still apply for this session.
  }
  applyResolvedTheme();
  notifyListeners();
}

/** Subscribe to preference/resolution changes. Returns an unsubscribe fn. */
export function subscribeToTheme(listener: ThemeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Apply the stored preference and start following the OS setting while the
 * preference is "system". Call once, before React mounts.
 */
export function initTheme(): void {
  applyResolvedTheme();
  if (typeof window.matchMedia !== "function") return;
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const handleChange = () => {
    if (getTheme() !== "system") return;
    applyResolvedTheme();
    notifyListeners();
  };
  // addEventListener is supported everywhere this app runs (Capacitor webview
  // included); guard anyway so a niche webview cannot crash startup.
  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", handleChange);
  }
}
