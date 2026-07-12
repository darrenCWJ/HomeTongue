// Single source of truth for the server-side language allowlists used by
// api/_lib/transcribeCore.js (STT) and api/_lib/ttsCore.js (TTS), and for
// per-language model routing in api/_lib/chatCore.js (LLM) and
// api/_lib/transcribeCore.js (STT).
//
// Adding a language pack on the client (src/languages/index.ts) REQUIRES a
// matching entry here, or the serverless functions will reject its requests.
// tests/languageManifest.test.ts imports both this manifest and the client
// pack registry and fails CI when they disagree.
//
// ── Per-language model routing (env var scheme) ──────────────────────────
// Every entry gets an `envSuffix` derived from its languageCode: uppercased,
// with each run of non-alphanumeric characters replaced by "_"
// ("yue-HK" -> "YUE_HK"). Setting
//   LLM_BASE_URL_<SUFFIX>  overrides the global LLM_BASE_URL  (/api/chat)
//   STT_BASE_URL_<SUFFIX>  overrides the global STT_BASE_URL  (/api/transcribe)
// for that language ONLY, so each language can point at its own fine-tuned
// model endpoint later without moving the others. Resolution order (see
// resolveBaseUrl below):
//   per-language env var -> global env var -> null (null = provider default, OpenAI).
//
// Files under api/_lib are not exposed as routes by Vercel.

/**
 * @typedef {Object} LanguageManifestEntry
 * @property {string} languageCode BCP-47 code sent to /api/tts (matches the client pack's tts.languageCode)
 * @property {string[]} sttLanguages language hints this dialect may send to /api/transcribe
 * @property {RegExp} ttsVoicePattern allowed Google TTS voice names for this language
 * @property {string} envSuffix uppercase env-var suffix derived from languageCode ("yue-HK" -> "YUE_HK")
 */

/**
 * @param {string} languageCode
 * @returns {string}
 */
function toEnvSuffix(languageCode) {
  return languageCode.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

const RAW_MANIFEST = [
  {
    languageCode: "yue-HK",
    sttLanguages: ["zh"],
    ttsVoicePattern: /^yue-HK-Chirp3-HD-[A-Za-z]+$/,
  },
  {
    // EXPERIMENTAL text-first language (Hokkien — Singapore usage; the code
    // names the Min Nan speech-locale family, see src/languages/nan-TW/
    // index.ts): no vendor speech models yet. Empty sttLanguages makes
    // transcribeCore refuse /api/transcribe
    // for this code with a clear error, and the never-matching voice pattern
    // ((?!) fails on every input, including "") makes ttsCore reject every
    // voice name — no request for this language can reach Google TTS.
    languageCode: "nan-TW",
    sttLanguages: [],
    ttsVoicePattern: /(?!)/,
  },
];

/** @type {LanguageManifestEntry[]} */
export const LANGUAGE_MANIFEST = RAW_MANIFEST.map((entry) => ({
  ...entry,
  envSuffix: toEnvSuffix(entry.languageCode),
}));

// English transcription is used app-wide (the learner's side of the
// conversation) regardless of which dialect pack is active.
export const BASE_STT_LANGUAGES = ["en"];

/** All STT language hints the server accepts, across every language plus the base set. */
export const ALLOWED_STT_LANGUAGES = new Set([
  ...BASE_STT_LANGUAGES,
  ...LANGUAGE_MANIFEST.flatMap((entry) => entry.sttLanguages),
]);

/** All TTS language codes the server accepts. */
export const ALLOWED_TTS_LANGUAGE_CODES = new Set(LANGUAGE_MANIFEST.map((entry) => entry.languageCode));

/**
 * Look up the manifest entry for a TTS language code.
 *
 * @param {string} languageCode
 * @returns {LanguageManifestEntry | undefined}
 */
export function findManifestEntry(languageCode) {
  return LANGUAGE_MANIFEST.find((entry) => entry.languageCode === languageCode);
}

const BASE_URL_ENV_NAMES = { llm: "LLM_BASE_URL", stt: "STT_BASE_URL" };

/**
 * Resolve the upstream base URL for a request, honoring per-language overrides.
 *
 * Order: LLM_BASE_URL_<SUFFIX> / STT_BASE_URL_<SUFFIX> for the given language
 * -> global LLM_BASE_URL / STT_BASE_URL -> null. Unknown or missing language
 * codes are ignored (global routing applies) so older and newer clients
 * interoperate. Empty-string env values are treated as unset.
 *
 * @param {"llm" | "stt"} kind which upstream is being routed
 * @param {string | null | undefined} languageCode optional pack languageCode from the request body
 * @param {Record<string, string | undefined>} env
 * @returns {string | null} base URL, or null when the provider default (OpenAI) applies
 */
export function resolveBaseUrl(kind, languageCode, env) {
  const globalVarName = BASE_URL_ENV_NAMES[kind];
  if (!globalVarName) {
    throw new Error(`resolveBaseUrl: unknown kind "${kind}" (expected "llm" or "stt")`);
  }
  const entry = typeof languageCode === "string" ? findManifestEntry(languageCode) : undefined;
  if (entry) {
    const perLanguageUrl = env[`${globalVarName}_${entry.envSuffix}`];
    if (perLanguageUrl) return perLanguageUrl;
  }
  return env[globalVarName] || null;
}
