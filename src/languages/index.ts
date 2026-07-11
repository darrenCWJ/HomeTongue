import type { LanguagePack } from "./types";
import { CANTONESE_PACK } from "./yue-HK";

export type { GoogleTTSVoice, LanguagePack } from "./types";

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
 * The single active pack. Cantonese is the only shipped language today;
 * when per-user language selection lands (Phase 4), callers switch from
 * this constant to `getLanguagePack(user.language)`.
 */
export const ACTIVE_LANGUAGE_PACK = LANGUAGE_PACKS[DEFAULT_LANGUAGE];
