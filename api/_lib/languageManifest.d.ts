export interface LanguageManifestEntry {
  /** BCP-47 code sent to /api/tts (matches the client pack's tts.languageCode) */
  languageCode: string;
  /** language hints this dialect may send to /api/transcribe */
  sttLanguages: string[];
  /** allowed Google TTS voice names for this language */
  ttsVoicePattern: RegExp;
  /** uppercase env-var suffix derived from languageCode ("yue-HK" -> "YUE_HK") */
  envSuffix: string;
}

export const LANGUAGE_MANIFEST: LanguageManifestEntry[];
export const BASE_STT_LANGUAGES: string[];
export const ALLOWED_STT_LANGUAGES: Set<string>;
export const ALLOWED_TTS_LANGUAGE_CODES: Set<string>;

export function findManifestEntry(languageCode: string): LanguageManifestEntry | undefined;

/**
 * Resolve the upstream base URL for a request, honoring per-language
 * overrides: LLM_BASE_URL_<SUFFIX> / STT_BASE_URL_<SUFFIX> -> global
 * LLM_BASE_URL / STT_BASE_URL -> null (provider default, OpenAI).
 */
export function resolveBaseUrl(
  kind: "llm" | "stt",
  languageCode: string | null | undefined,
  env: Record<string, string | undefined>
): string | null;
