// Guards the contract between the CLIENT language pack registry
// (src/languages/index.ts) and the SERVER allowlist manifest
// (api/_lib/languageManifest.js). Adding a language pack without updating the
// server manifest — or vice versa — fails here before it fails in production.

import { describe, test, expect } from "vitest";
import {
  LANGUAGE_MANIFEST,
  ALLOWED_STT_LANGUAGES,
  ALLOWED_TTS_LANGUAGE_CODES,
  findManifestEntry,
} from "../api/_lib/languageManifest.js";
import { LANGUAGE_PACKS } from "../src/languages";

const packs = Object.values(LANGUAGE_PACKS);

describe("language manifest ↔ client pack registry agreement", () => {
  test("every client pack has a manifest entry for its TTS language code", () => {
    for (const pack of packs) {
      const entry = findManifestEntry(pack.tts.languageCode);
      expect(
        entry,
        `manifest entry missing for pack "${pack.code}" (${pack.tts.languageCode})`
      ).toBeDefined();
      expect(ALLOWED_TTS_LANGUAGE_CODES.has(pack.tts.languageCode)).toBe(true);
    }
  });

  test("every client pack voice name passes the manifest voice pattern", () => {
    for (const pack of packs) {
      const entry = findManifestEntry(pack.tts.languageCode);
      expect(entry).toBeDefined();
      for (const [key, voice] of Object.entries(pack.tts.voices)) {
        expect(
          entry!.ttsVoicePattern.test(voice.name),
          `voice "${key}" (${voice.name}) of pack "${pack.code}" is rejected by the server pattern ${entry!.ttsVoicePattern}`
        ).toBe(true);
      }
    }
  });

  test("every client pack STT language hint is allowed by the server", () => {
    for (const pack of packs) {
      expect(
        ALLOWED_STT_LANGUAGES.has(pack.stt.language),
        `STT language "${pack.stt.language}" of pack "${pack.code}" is not in the server allowlist`
      ).toBe(true);
    }
  });

  test("the app-wide English transcription hint stays allowed", () => {
    // transcribeEnglish / transcribeAnyLanguage in translationService send "en"
    // regardless of the active dialect pack.
    expect(ALLOWED_STT_LANGUAGES.has("en")).toBe(true);
  });

  test("manifest language codes are unique", () => {
    const codes = LANGUAGE_MANIFEST.map((entry) => entry.languageCode);
    expect(new Set(codes).size).toBe(codes.length);
  });

  test("every pack's default voice and legacy voice targets exist in its registry", () => {
    for (const pack of packs) {
      expect(pack.tts.voices[pack.tts.defaultVoice], `default voice of pack "${pack.code}"`).toBeDefined();
      for (const [legacyId, target] of Object.entries(pack.tts.legacyVoiceMap)) {
        expect(
          pack.tts.voices[target],
          `legacy voice "${legacyId}" of pack "${pack.code}" maps to unknown key "${target}"`
        ).toBeDefined();
      }
    }
  });
});
