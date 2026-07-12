import { describe, test, expect } from "vitest";
import { LANGUAGE_PACKS } from "./index";

describe("language pack voice invariants", () => {
  for (const [code, pack] of Object.entries(LANGUAGE_PACKS)) {
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
      expect(pack.tts.voices).toHaveProperty(pack.tts.defaultVoice);
    });

    test(`${code}: legacy voice map targets exist in the voice registry`, () => {
      for (const target of Object.values(pack.tts.legacyVoiceMap)) {
        expect(pack.tts.voices, `legacy map target "${target}"`).toHaveProperty(target);
      }
    });
  }
});
