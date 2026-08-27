import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { DisplayVoice } from "../../languages/types";
import { OnboardingPage } from "./OnboardingPage";

// Two bugs under test:
//  PROF-03 — picking "Work" claimed to tailor the AI to a professional
//    context, but the only code path that wrote a work persona was gated on a
//    job title that no UI could ever set. The choice wrote nothing but
//    `activePersona`, so the work tone never took effect.
//  PROF-09 — the voice step seeds `voiceId` from the first voice of the pack
//    that was active at MOUNT. If the pack changes underneath (profile
//    hydration resolving a different dialect), onboarding finished by storing
//    a voice id that does not exist in the pack now in use.

const PACK_A_VOICES: DisplayVoice[] = [
  { key: "zephyr", label: "Jamie", gender: "female", style: "Bright", description: "Bright" },
  { key: "aoede", label: "Sarah", gender: "female", style: "Breezy", description: "Breezy" },
];

const PACK_B_VOICES: DisplayVoice[] = [
  { key: "kore", label: "Ping", gender: "female", style: "Warm", description: "Warm" },
];

const mocks = vi.hoisted(() => ({ displayVoices: [] as DisplayVoice[] }));

vi.mock("motion/react", async () => {
  const react = await import("react");
  const MOTION_ONLY_PROPS = new Set(["initial", "animate", "exit", "transition"]);
  const stub = (tag: string) =>
    react.forwardRef<Element, Record<string, unknown>>((props, ref) => {
      const rest: Record<string, unknown> = { ref };
      for (const key of Object.keys(props)) {
        if (!MOTION_ONLY_PROPS.has(key)) rest[key] = props[key];
      }
      return react.createElement(tag, rest);
    });
  return {
    AnimatePresence: (props: { children?: unknown }) =>
      react.createElement(react.Fragment, null, props.children as never),
    motion: new Proxy({}, { get: (_t, prop: string) => stub(prop) }),
  };
});

const updateUserProfile = vi.fn();

vi.mock("../context/ProfileProvider", () => ({
  useProfile: () => ({ updateUserProfile }),
}));

vi.mock("../../hooks/useActiveLanguageCode", () => ({
  useActiveLanguagePack: () => ({ tts: { displayVoices: mocks.displayVoices } }),
}));

vi.mock("../../utils/voicePreviewCache", () => ({
  previewVoice: vi.fn(() => Promise.resolve()),
}));

const clickButton = (name: RegExp) => fireEvent.click(screen.getByRole("button", { name }));

function enterName(name = "Darren") {
  fireEvent.change(screen.getByPlaceholderText("Enter your name"), { target: { value: name } });
  clickButton(/^continue$/i);
}

const finishedUpdates = () => updateUserProfile.mock.calls[0][0] as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.displayVoices = PACK_A_VOICES;
});

describe("OnboardingPage persona step", () => {
  test("choosing Work seeds the work persona so the formal tone takes effect", () => {
    // Arrange
    render(<OnboardingPage />);
    enterName();
    clickButton(/^continue$/i); // voice step

    // Act
    clickButton(/^work/i);
    clickButton(/^continue$/i); // persona step -> video step
    clickButton(/get started/i);

    // Assert
    expect(updateUserProfile).toHaveBeenCalledTimes(1);
    expect(finishedUpdates()).toMatchObject({
      name: "Darren",
      activePersona: "work",
      personaProfiles: { work: { tone: "formal" } },
    });
  });

  test("choosing Personal seeds no persona profile", () => {
    // Arrange
    render(<OnboardingPage />);
    enterName();
    clickButton(/^continue$/i);

    // Act
    clickButton(/^personal/i);
    clickButton(/^continue$/i);
    clickButton(/get started/i);

    // Assert
    expect(finishedUpdates()).toMatchObject({ activePersona: "personal" });
    expect(finishedUpdates()).not.toHaveProperty("personaProfiles");
  });
});

describe("OnboardingPage voice step", () => {
  test("a pack switch resets the selection to a voice the new pack actually has", () => {
    // Arrange — pick a non-default voice from the pack active at mount
    const { rerender } = render(<OnboardingPage />);
    enterName();
    clickButton(/^sarah$/i);

    // Act — the active pack changes underneath (dialect resolved on hydration)
    mocks.displayVoices = PACK_B_VOICES;
    rerender(<OnboardingPage />);
    clickButton(/^continue$/i);
    clickButton(/^continue$/i);
    clickButton(/get started/i);

    // Assert — never stores "aoede", which does not exist in the new pack
    expect(finishedUpdates()).toMatchObject({ preferredVoiceId: "kore" });
  });

  test("stores the chosen voice when the pack does not change", () => {
    // Arrange
    render(<OnboardingPage />);
    enterName();

    // Act
    clickButton(/^sarah$/i);
    clickButton(/^continue$/i);
    clickButton(/^continue$/i);
    clickButton(/get started/i);

    // Assert
    expect(finishedUpdates()).toMatchObject({ preferredVoiceId: "aoede" });
  });

  test("a voice-less pack skips the step and stores no voice preference", () => {
    // Arrange
    mocks.displayVoices = [];
    render(<OnboardingPage />);

    // Act
    enterName();
    clickButton(/^continue$/i); // persona step -> video step
    clickButton(/get started/i);

    // Assert
    expect(finishedUpdates()).not.toHaveProperty("preferredVoiceId");
  });
});
