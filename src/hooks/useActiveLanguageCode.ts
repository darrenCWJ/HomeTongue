import { useProfile } from "../app/context/ProfileProvider";
import { resolveLanguagePackByLabel } from "../languages";
import type { LanguagePack } from "../languages";

/**
 * The active language pack, derived reactively from the profile's dialect.
 *
 * Prefer this (and the derived hooks below) in components over the
 * module-level getActiveLanguagePack(): the module state is synced in a
 * ProfileProvider effect and can lag one render behind a dialect switch.
 */
export function useActiveLanguagePack(): LanguagePack {
  const { dialect } = useProfile();
  return resolveLanguagePackByLabel(dialect);
}

/**
 * The active language pack's code (e.g. "yue-HK"), derived reactively so
 * components re-render (and re-filter their data via src/languages/scope.ts)
 * when the user switches dialect.
 */
export function useActiveLanguageCode(): string {
  return useActiveLanguagePack().code;
}

/**
 * Speech-model capabilities of the active pack, derived reactively.
 * `tts`/`stt` false means no usable vendor model exists yet — UI must hide
 * or disable the affected voice controls (the plumbing already no-ops).
 */
export function useActiveCapabilities(): LanguagePack["capabilities"] {
  return useActiveLanguagePack().capabilities;
}
