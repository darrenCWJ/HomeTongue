import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { UserProfile } from "../../../types";
import { LANGUAGE_PACKS } from "../../../languages";
import { VoiceSection } from "./VoiceSection";

// The bug under test (PROF-06): the selected-state compare used the RAW stored
// `preferredVoiceId`, while playback resolves it through `asVoiceKey()`. A
// profile still holding a legacy ElevenLabs id therefore heard one voice and
// saw NO voice ticked at all — the picker disagreed with the app.

vi.mock("../../../utils/voicePreviewCache", () => ({
  previewVoice: vi.fn(() => Promise.resolve()),
}));

const PACK = LANGUAGE_PACKS["yue-HK"];
const DISPLAY_VOICES = PACK.tts.displayVoices;
// A real legacy id from the pack's own migration map, so this fixture cannot
// drift away from what `asVoiceKey()` actually resolves.
const [LEGACY_VOICE_ID, MAPPED_VOICE_KEY] = Object.entries(PACK.tts.legacyVoiceMap)[0];

const BASE_PROFILE: UserProfile = {
  id: "p1",
  name: "Darren",
  preferredDialect: "Cantonese",
  preferredTone: "casual",
  toneOverrideEnabled: false,
  personalityNotes: "",
  conversationCount: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function renderSection(preferredVoiceId: string | undefined) {
  return render(
    <VoiceSection
      displayVoices={DISPLAY_VOICES}
      userProfile={{ ...BASE_PROFILE, preferredVoiceId }}
      updateUserProfile={vi.fn()}
    />
  );
}

const checkedVoiceKey = () =>
  screen
    .getAllByRole("radio")
    .find((radio) => (radio as HTMLInputElement).checked)
    ?.getAttribute("value");

const labelFor = (key: string) => DISPLAY_VOICES.find((v) => v.key === key)?.label;

describe("VoiceSection selected state", () => {
  test("a legacy provider voice id ticks the voice actually used", () => {
    // Arrange + Act
    renderSection(LEGACY_VOICE_ID);

    // Assert — resolves through the pack's legacy map, same as playback does
    expect(checkedVoiceKey()).toBe(MAPPED_VOICE_KEY);
    expect(screen.getByText(labelFor(MAPPED_VOICE_KEY)!)).toBeInTheDocument();
  });

  test("an unknown stored voice id falls back to the pack default", () => {
    // Arrange + Act
    renderSection("voice-that-no-longer-exists");

    // Assert
    expect(checkedVoiceKey()).toBe(PACK.tts.defaultVoice);
  });

  test("no stored preference ticks the pack default", () => {
    // Arrange + Act
    renderSection(undefined);

    // Assert
    expect(checkedVoiceKey()).toBe(PACK.tts.defaultVoice);
  });

  test("a current voice key still ticks itself", () => {
    // Arrange — a female voice, so it is on the default gender tab
    const female = DISPLAY_VOICES.filter((v) => v.gender === "female")[1];

    // Act
    renderSection(female.key);

    // Assert
    expect(checkedVoiceKey()).toBe(female.key);
  });
});
