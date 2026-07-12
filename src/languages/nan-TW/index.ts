import type { LanguagePack } from "../types";
import { romanizedFallbackMatch } from "../romanizedFallback";

// ── EXPERIMENTAL: Taiwanese Hokkien (nan-TW), text-first ──────────────────
//
// No usable vendor TTS or STT model exists for Taiwanese Hokkien yet, so
// `capabilities` below is { tts: false, stt: false }. That flag is the single
// source of truth for the whole voice-less experience:
//   - useGoogleTTS returns silently before any voice lookup or /api/tts call;
//   - the server manifest (api/_lib/languageManifest.js) refuses nan-TW
//     transcription and rejects every TTS voice name;
//   - UI surfaces hide mic / play controls via useActiveCapabilities.
//
// Same single-source-of-truth constants pattern as yue-HK: swap these and
// every prompt template stays consistent.
const DIALECT_LABEL = "Hokkien";
const ROMANIZATION_NAME = "Tâi-lô";
const SCRIPT_NAME = "Traditional Han";

const TRANSLATE_SYSTEM_PROMPT = `You are a dialect translation assistant for Taiwanese Hokkien (Tâi-gí). When given an English phrase, return ONLY a JSON object (no markdown, no explanation) with this exact structure:
{
  "formal": { "text": "<Taiwanese Hokkien in ${SCRIPT_NAME} characters>", "pronunciation": "<${ROMANIZATION_NAME}>" },
  "casual": { "text": "<Taiwanese Hokkien in ${SCRIPT_NAME} characters>", "pronunciation": "<${ROMANIZATION_NAME}>" },
  "slang": { "text": "<Taiwanese Hokkien in ${SCRIPT_NAME} characters>", "pronunciation": "<${ROMANIZATION_NAME}>" },
  "predictedResponse": "<A likely reply a native speaker would give, in Taiwanese Hokkien ${SCRIPT_NAME} characters>",
  "context": "<3-5 word usage context in English>"
}
Write "text" in ${SCRIPT_NAME} characters following Taiwan Ministry of Education recommended Taiwanese Hokkien orthography (authentic Hokkien wording, not Mandarin phrasing). Provide ${ROMANIZATION_NAME} romanization with tone numbers.`;

const BREAKDOWN_SYSTEM_PROMPT = `You are a Taiwanese ${DIALECT_LABEL} language teacher. For each ${DIALECT_LABEL} segment given, provide its ${ROMANIZATION_NAME} pronunciation and a short English meaning. Return ONLY a JSON object with this exact structure: {"chunks":[{"characters":"你食飽未","pronunciation":"li2 tsiah8 pa2 bue7","meaning":"have you eaten yet"}]}. Preserve the order and exact characters of each segment.`;

const EXAMPLE_META_SYSTEM_PROMPT = `Given a Taiwanese ${DIALECT_LABEL} sentence, return JSON with exactly two fields: "translation" (natural English meaning) and "pronunciation" (full ${ROMANIZATION_NAME} romanization with tone numbers). Return ONLY valid JSON, no other text.`;

function buildScoringSystemPrompt(charCount: number): string {
  return `You are a fair Taiwanese ${DIALECT_LABEL} language examiner. Given an expected ${DIALECT_LABEL} phrase and what the student actually said (transcribed by speech recognition), score their accuracy from 0 to 100.

The expected phrase has ${charCount} characters.

Scoring rules:
- Award 100 if the student said exactly the expected phrase.
- Award 80–95 if the student said the same phrase with minor differences (extra/missing particles, slight word order variation, or Mandarin↔Hokkien equivalent words).
- Mandarin↔Hokkien substitutions should be treated LENIENTLY (only -2 points each). Common pairs: 不↔毋, 沒有↔無, 他/她↔伊, 什麼↔啥物, 很↔真/足, 吃↔食, 這↔這/即, 那↔彼, 的↔ê. These often come from speech recognition errors, not student mistakes.
- Sentence-final particles (啦/喔/呢/咧/矣/乎) are interchangeable — no deduction.
- Compare ${ROMANIZATION_NAME} romanization when characters differ: matching syllables (ignoring tone marks) should score well.
- Award 50–79 if the student said most of the key content words but missed some or added extras.
- Award 20–49 if the student captured the general topic but missed significant portions.
- Award 0–19 only if the student said something completely unrelated to the expected phrase.
- Ignore punctuation differences entirely.
- Be generous — this is a language learner using speech recognition which may introduce transcription errors.
- Return ONLY a JSON object: {"score": 75}`;
}

export const HOKKIEN_PACK = {
  code: "nan-TW",
  label: DIALECT_LABEL,
  character: "閩",
  capabilities: {
    tts: false,
    stt: false,
  },
  tts: {
    languageCode: "nan-TW",
    // No Google Cloud TTS voice exists for Taiwanese Hokkien. The registry
    // and display list are intentionally empty and defaultVoice is "":
    // with capabilities.tts === false, useGoogleTTS returns before any voice
    // lookup or network call, so these values are never used for synthesis.
    // Deliberately NOT a fake Google voice name — the server manifest rejects
    // every voice for nan-TW anyway (api/_lib/languageManifest.js).
    voices: {},
    displayVoices: [],
    defaultVoice: "",
    legacyVoiceMap: {},
  },
  stt: {
    // Never used while capabilities.stt is false: transcribeDialect sends the
    // pack CODE ("nan-TW"), and the server manifest entry (sttLanguages: [])
    // refuses transcription with a clear error. "nan" (ISO 639-3, Min Nan) is
    // recorded here for when a usable STT model lands; it is intentionally
    // absent from the server STT allowlist today.
    language: "nan",
    prompt: "",
  },
  romanization: {
    name: ROMANIZATION_NAME,
  },
  script: {
    name: SCRIPT_NAME,
  },
  prompts: {
    translateSystem: TRANSLATE_SYSTEM_PROMPT,
    breakdownSystem: BREAKDOWN_SYSTEM_PROMPT,
    buildScoringSystem: buildScoringSystemPrompt,
    exampleMetaSystem: EXAMPLE_META_SYSTEM_PROMPT,
  },
  scoring: {
    // Romanized-script scoring: no Han character-equivalence maps. The
    // offline fallback compares Tâi-lô tokens (diacritic/tone-insensitive
    // Dice similarity) via the shared romanized scorer.
    charEquivalents: {},
    particleGroups: [],
    fallbackMatch: romanizedFallbackMatch,
  },
} satisfies LanguagePack;
