import { useSyncExternalStore } from "react";
import {
  getResolvedTheme,
  getTheme,
  setTheme,
  subscribeToTheme,
  type ResolvedTheme,
  type ThemePreference,
} from "../lib/theme";

interface UseThemeResult {
  /** The stored preference: "light" | "dark" | "system". */
  preference: ThemePreference;
  /** What is actually rendered right now ("system" resolved). */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
}

/** React binding for the theme store in src/lib/theme.ts. */
export function useTheme(): UseThemeResult {
  const preference = useSyncExternalStore(subscribeToTheme, getTheme);
  const resolvedTheme = useSyncExternalStore(subscribeToTheme, getResolvedTheme);
  return { preference, resolvedTheme, setTheme };
}
