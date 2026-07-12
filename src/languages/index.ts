import type { LanguagePack } from "./types";
import { CANTONESE_PACK } from "./yue-HK";

export type { DisplayVoice, GoogleTTSVoice, LanguagePack } from "./types";

export const LANGUAGE_PACKS = {
  "yue-HK": CANTONESE_PACK,
} satisfies Record<string, LanguagePack>;

export type LanguageCode = keyof typeof LANGUAGE_PACKS;

export const DEFAULT_LANGUAGE: LanguageCode = "yue-HK";

/** Look up a pack by language code, falling back to the default language. */
export function getLanguagePack(code: string): LanguagePack {
  const packs: Readonly<Record<string, LanguagePack | undefined>> = LANGUAGE_PACKS;
  return packs[code] ?? LANGUAGE_PACKS[DEFAULT_LANGUAGE];
}

/**
 * Look up a pack by its human-readable label (matches `DIALECTS` labels in
 * src/types.ts, e.g. "Cantonese"), falling back to the default pack.
 */
export function resolveLanguagePackByLabel(label: string): LanguagePack {
  for (const pack of Object.values(LANGUAGE_PACKS)) {
    if (pack.label === label) return pack;
  }
  return LANGUAGE_PACKS[DEFAULT_LANGUAGE];
}

// Per-user language selection (Phase 4): ProfileProvider calls
// setActiveLanguage() from the profile's preferredDialect; services and hooks
// read getActiveLanguagePack() at USE time so a selection change is live
// without re-importing modules. With one shipped pack this is always the
// Cantonese pack, i.e. behavior-identical to the old ACTIVE_LANGUAGE_PACK
// module constant.
let activeLanguagePack: LanguagePack = LANGUAGE_PACKS[DEFAULT_LANGUAGE];

/** The currently active language pack (module-level, not reactive). */
export function getActiveLanguagePack(): LanguagePack {
  return activeLanguagePack;
}

/** Switch the active language pack; unknown codes fall back to the default. */
export function setActiveLanguage(code: string): void {
  activeLanguagePack = getLanguagePack(code);
}
