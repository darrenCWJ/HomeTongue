import { describe, test, expect } from "vitest";
import { LANGUAGE_PACKS, type LanguagePack } from "./index";
import { getLessonContent } from "../data/lessons";

// Widen the const-asserted registry entries to the contract type so indexed
// voice lookups type-check across packs with different literal voice maps.
const PACK_ENTRIES: ReadonlyArray<[string, LanguagePack]> = Object.entries(LANGUAGE_PACKS);

describe("language pack voice invariants", () => {
  for (const [code, pack] of PACK_ENTRIES) {
    test(`${code}: every display voice key exists in the voice registry`, () => {
      for (const displayVoice of pack.tts.displayVoices) {
        expect(pack.tts.voices, `display voice "${displayVoice.key}"`).toHaveProperty(displayVoice.key);
      }
    });

    test(`${code}: display voice gender matches the registry entry`, () => {
      for (const displayVoice of pack.tts.displayVoices) {
        expect(pack.tts.voices[displayVoice.key]?.gender).toBe(displayVoice.gender);
      }
    });

    test(`${code}: default voice exists in the voice registry`, () => {
      if (pack.capabilities.tts) {
        expect(pack.tts.voices).toHaveProperty(pack.tts.defaultVoice);
      } else {
        // Voice-less pack (capabilities.tts false): there is no voice to
        // default to. The empty-string sentinel is safe because useGoogleTTS
        // no-ops before any voice lookup for these packs.
        expect(pack.tts.defaultVoice).toBe("");
      }
    });

    test(`${code}: TTS capability flag agrees with the voice registry`, () => {
      const hasVoices = Object.keys(pack.tts.voices).length > 0;
      expect(hasVoices, "capabilities.tts must match whether voices exist").toBe(pack.capabilities.tts);
      if (!pack.capabilities.tts) {
        expect(pack.tts.displayVoices, "voice-less packs must not surface display voices").toHaveLength(0);
      }
    });

    test(`${code}: legacy voice map targets exist in the voice registry`, () => {
      for (const target of Object.values(pack.tts.legacyVoiceMap)) {
        expect(pack.tts.voices, `legacy map target "${target}"`).toHaveProperty(target);
      }
    });
  }
});

describe("lesson id convention", () => {
  // yue-HK ids are historical and unprefixed; every OTHER language must
  // prefix lesson AND category ids with its primary subtag ("nan-…") so ids
  // stay globally unique and LessonProgress never needs a language column
  // (see src/data/lessons.ts).
  test("non-yue lesson and category ids are prefixed with the language code", () => {
    for (const code of Object.keys(LANGUAGE_PACKS)) {
      if (code === "yue-HK") continue;
      const prefix = `${code.split("-")[0].toLowerCase()}-`;
      const { categories, lessons } = getLessonContent(code);
      for (const lesson of lessons) {
        expect(
          lesson.id.startsWith(prefix),
          `lesson "${lesson.id}" of ${code} must start with "${prefix}"`
        ).toBe(true);
      }
      for (const category of categories) {
        expect(
          category.id.startsWith(prefix),
          `category "${category.id}" of ${code} must start with "${prefix}"`
        ).toBe(true);
      }
    }
  });
});
