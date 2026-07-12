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
  resolveBaseUrl,
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

  test("STT-capable packs are allowed by the server; STT-less packs are refused", () => {
    for (const pack of packs) {
      if (pack.capabilities.stt) {
        expect(
          ALLOWED_STT_LANGUAGES.has(pack.stt.language),
          `STT language "${pack.stt.language}" of pack "${pack.code}" is not in the server allowlist`
        ).toBe(true);
      } else {
        // Voice-less packs must have an EMPTY sttLanguages entry so
        // transcribeCore returns its explicit "not available yet" error for
        // the pack code instead of silently transcribing.
        const entry = findManifestEntry(pack.tts.languageCode);
        expect(entry?.sttLanguages, `sttLanguages of "${pack.code}"`).toEqual([]);
      }
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
      if (pack.capabilities.tts) {
        expect(pack.tts.voices[pack.tts.defaultVoice], `default voice of pack "${pack.code}"`).toBeDefined();
      } else {
        // Voice-less pack: the registry must be truly empty so no code path
        // can ever resolve a synthesizable voice for it.
        expect(Object.keys(pack.tts.voices), `voices of voice-less pack "${pack.code}"`).toHaveLength(0);
        expect(pack.tts.displayVoices, `displayVoices of voice-less pack "${pack.code}"`).toHaveLength(0);
      }
      for (const [legacyId, target] of Object.entries(pack.tts.legacyVoiceMap)) {
        expect(
          pack.tts.voices[target],
          `legacy voice "${legacyId}" of pack "${pack.code}" maps to unknown key "${target}"`
        ).toBeDefined();
      }
    }
  });
});

describe("voice-less pack server contract (nan-TW)", () => {
  test("manifest entry exists with no STT languages (server refuses transcription)", () => {
    const entry = findManifestEntry("nan-TW");
    expect(entry).toBeDefined();
    expect(entry!.sttLanguages).toEqual([]);
  });

  test("ttsVoicePattern rejects every voice name, including the empty string", () => {
    const entry = findManifestEntry("nan-TW")!;
    for (const name of ["yue-HK-Chirp3-HD-Zephyr", "nan-TW-Chirp3-HD-Anything", "", "x"]) {
      expect(entry.ttsVoicePattern.test(name), `voice name "${name}" must be rejected`).toBe(false);
    }
  });

  test('envSuffix derives to "NAN_TW" and per-language routing still works', () => {
    expect(findManifestEntry("nan-TW")?.envSuffix).toBe("NAN_TW");
    // A text-first language can still route its LLM traffic to a dedicated
    // fine-tuned endpoint even though it has no speech models.
    expect(resolveBaseUrl("llm", "nan-TW", { LLM_BASE_URL_NAN_TW: "https://nan-llm.example.com/v1" })).toBe(
      "https://nan-llm.example.com/v1"
    );
  });
});

describe("per-language routing env suffixes", () => {
  test("every entry has an uppercase, underscore-only envSuffix derived from its languageCode", () => {
    for (const entry of LANGUAGE_MANIFEST) {
      expect(entry.envSuffix, `envSuffix of "${entry.languageCode}"`).toMatch(/^[A-Z0-9]+(_[A-Z0-9]+)*$/);
      expect(entry.envSuffix).toBe(entry.languageCode.toUpperCase().replace(/[^A-Z0-9]+/g, "_"));
    }
  });

  test("envSuffixes are unique across the manifest", () => {
    const suffixes = LANGUAGE_MANIFEST.map((entry) => entry.envSuffix);
    expect(new Set(suffixes).size).toBe(suffixes.length);
  });

  test('"yue-HK" maps to suffix "YUE_HK"', () => {
    expect(findManifestEntry("yue-HK")?.envSuffix).toBe("YUE_HK");
  });
});

describe("resolveBaseUrl", () => {
  const ENV = {
    LLM_BASE_URL: "https://global-llm.example.com/v1",
    STT_BASE_URL: "https://global-stt.example.com/transcribe",
    LLM_BASE_URL_YUE_HK: "https://yue-llm.example.com/v1",
    STT_BASE_URL_YUE_HK: "https://yue-stt.example.com/transcribe",
  };

  test("prefers the per-language env var when set", () => {
    expect(resolveBaseUrl("llm", "yue-HK", ENV)).toBe("https://yue-llm.example.com/v1");
    expect(resolveBaseUrl("stt", "yue-HK", ENV)).toBe("https://yue-stt.example.com/transcribe");
  });

  test("falls back to the global env var when the per-language var is unset", () => {
    expect(resolveBaseUrl("llm", "yue-HK", { LLM_BASE_URL: ENV.LLM_BASE_URL })).toBe(ENV.LLM_BASE_URL);
    expect(resolveBaseUrl("stt", "yue-HK", { STT_BASE_URL: ENV.STT_BASE_URL })).toBe(ENV.STT_BASE_URL);
  });

  test("returns null (provider default) when nothing is configured", () => {
    expect(resolveBaseUrl("llm", "yue-HK", {})).toBeNull();
    expect(resolveBaseUrl("stt", undefined, {})).toBeNull();
    expect(resolveBaseUrl("llm", null, {})).toBeNull();
  });

  test("ignores unknown language codes and applies global routing", () => {
    expect(resolveBaseUrl("llm", "xx-XX", ENV)).toBe(ENV.LLM_BASE_URL);
    expect(resolveBaseUrl("stt", "xx-XX", {})).toBeNull();
  });

  test("treats empty-string env values as unset", () => {
    expect(resolveBaseUrl("llm", "yue-HK", { LLM_BASE_URL_YUE_HK: "", LLM_BASE_URL: "" })).toBeNull();
    expect(resolveBaseUrl("llm", "yue-HK", { LLM_BASE_URL_YUE_HK: "", LLM_BASE_URL: ENV.LLM_BASE_URL })).toBe(
      ENV.LLM_BASE_URL
    );
  });

  test("throws on an unknown kind", () => {
    expect(() => resolveBaseUrl("tts" as never, "yue-HK", {})).toThrow(/unknown kind/);
  });
});
