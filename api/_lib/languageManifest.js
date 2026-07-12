// Single source of truth for the server-side language allowlists used by
// api/_lib/transcribeCore.js (STT) and api/_lib/ttsCore.js (TTS).
//
// Adding a language pack on the client (src/languages/index.ts) REQUIRES a
// matching entry here, or the serverless functions will reject its requests.
// tests/languageManifest.test.ts imports both this manifest and the client
// pack registry and fails CI when they disagree.
//
// Files under api/_lib are not exposed as routes by Vercel.

/**
 * @typedef {Object} LanguageManifestEntry
 * @property {string} languageCode BCP-47 code sent to /api/tts (matches the client pack's tts.languageCode)
 * @property {string[]} sttLanguages language hints this dialect may send to /api/transcribe
 * @property {RegExp} ttsVoicePattern allowed Google TTS voice names for this language
 */

/** @type {LanguageManifestEntry[]} */
export const LANGUAGE_MANIFEST = [
  {
    languageCode: "yue-HK",
    sttLanguages: ["zh"],
    ttsVoicePattern: /^yue-HK-Chirp3-HD-[A-Za-z]+$/,
  },
];

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
