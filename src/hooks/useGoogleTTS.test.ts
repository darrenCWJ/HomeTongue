import { describe, test, expect } from "vitest";
import { asVoiceKey, mapElevenLabsVoice, DEFAULT_VOICE, GOOGLE_TTS_VOICES } from "./useGoogleTTS";

describe("asVoiceKey", () => {
  test("passes through a valid voice key", () => {
    expect(asVoiceKey("puck")).toBe("puck");
  });

  test("maps a legacy ElevenLabs voice ID", () => {
    expect(asVoiceKey("21m00Tcm4TlvDq8ikWAM")).toBe("zephyr");
  });

  test("falls back to the default voice for unknown IDs", () => {
    expect(asVoiceKey("not-a-voice")).toBe(DEFAULT_VOICE);
  });

  test("falls back to the default voice for undefined and null", () => {
    expect(asVoiceKey(undefined)).toBe(DEFAULT_VOICE);
    expect(asVoiceKey(null)).toBe(DEFAULT_VOICE);
    expect(asVoiceKey("")).toBe(DEFAULT_VOICE);
  });

  test("every registered voice key resolves to itself", () => {
    for (const key of Object.keys(GOOGLE_TTS_VOICES)) {
      expect(asVoiceKey(key)).toBe(key);
    }
  });
});

describe("mapElevenLabsVoice", () => {
  test("maps known ID and defaults unknown IDs", () => {
    expect(mapElevenLabsVoice("21m00Tcm4TlvDq8ikWAM")).toBe("zephyr");
    expect(mapElevenLabsVoice("nonexistent")).toBe(DEFAULT_VOICE);
  });
});

describe("GOOGLE_TTS_VOICES registry", () => {
  test("all voice names match the yue-HK Chirp3 HD pattern the API allowlists", () => {
    for (const voice of Object.values(GOOGLE_TTS_VOICES)) {
      expect(voice.name).toMatch(/^yue-HK-Chirp3-HD-[A-Za-z]+$/);
    }
  });
});
