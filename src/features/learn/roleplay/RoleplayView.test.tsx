import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { RoleplayScenario } from "../../../services/roleplayService";
import { RoleplayView } from "./RoleplayView";

// LEARN-05 — "Save these phrases" tracked what had been saved in state owned
// by RoleplaySummary, which "Keep practising" UNMOUNTS. Re-opening the
// summary showed every phrase unsaved again, and each save minted a random
// phrase id (`roleplay-${newId()}`), so re-saving wrote a duplicate row
// instead of hitting addPhrase's id dedupe.

const mockAddPhrase = vi.fn();

let nextId = 0;

vi.mock("../../../utils/id", () => ({
  newId: () => `turn-${++nextId}`,
}));

vi.mock("../../../app/context/LibraryProvider", () => ({
  useLibrary: () => ({ addPhrase: mockAddPhrase }),
}));

vi.mock("../../../app/context/ProfileProvider", () => ({
  useProfile: () => ({ userProfile: null }),
}));

vi.mock("../../../hooks/useActiveLanguageCode", () => ({
  useActiveLanguagePack: () => ({
    label: "Cantonese",
    capabilities: { tts: false, stt: false },
  }),
}));

vi.mock("../../../hooks/audio", () => ({
  useAudioRecorder: () => ({ startRecording: vi.fn(), stopRecording: vi.fn() }),
}));

vi.mock("../../../hooks/useGoogleTTS", () => ({
  speakText: vi.fn(() => Promise.resolve()),
  asVoiceKey: () => "zephyr",
}));

vi.mock("../../../services/translationService", () => ({
  transcribeDialect: vi.fn(),
  transcribeAnyLanguage: vi.fn(),
}));

vi.mock("../../../services/roleplayService", () => ({
  nextBotTurn: vi.fn(() => Promise.resolve(null)),
  coachUserTurn: vi.fn(() => Promise.resolve(null)),
  toHistory: (turns: unknown[]) => turns,
}));

vi.mock("./RoleplayBubble", () => ({
  RoleplayBubble: ({ turn }: { turn: { text: string } }) => <p>{turn.text}</p>,
}));

// Nothing here depends on animation, and importing the real barrel costs this
// file ~5s — the whole per-test budget, which made it time out under a loaded
// full-suite run. The view and the summary only ever render motion.div.
vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, className }: { children?: ReactNode; className?: string }) => (
      <div className={className}>{children}</div>
    ),
  },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

const SCENARIO: RoleplayScenario = {
  id: "kopi",
  languageCode: "yue-HK",
  title: "Ordering kopi",
  subtitle: "At the coffee shop",
  emoji: "☕",
  counterpart: "the stall auntie",
  setting: "a hawker centre",
  botSystem: "",
  opening: { dialect: "飲咩啊", romanization: "jam2 me1 aa3", english: "What would you like?" },
  goalHints: ["Order a drink"],
};

const click = (name: RegExp | string) => fireEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  nextId = 0;
  mockAddPhrase.mockReset();
  // jsdom has no layout engine and therefore no scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
});

describe("RoleplaySummary saved-phrase state", () => {
  test("a saved phrase is still marked saved after the summary is reopened", () => {
    render(<RoleplayView scenario={SCENARIO} onBack={vi.fn()} />);

    click("End");
    click(/^save phrase$/i);
    expect(mockAddPhrase).toHaveBeenCalledTimes(1);

    // "Keep practising" unmounts the summary — reopening must not forget.
    click(/keep practising/i);
    click("End");

    expect(screen.getByRole("button", { name: /saved to phrases/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^save phrase$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save all/i })).not.toBeInTheDocument();
  });

  test("a saved phrase gets a deterministic id derived from its turn", () => {
    render(<RoleplayView scenario={SCENARIO} onBack={vi.fn()} />);

    click("End");
    click(/^save phrase$/i);

    expect(mockAddPhrase).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "roleplay-turn-1",
        dialect: "飲咩啊",
        original: "What would you like?",
        pronunciation: "jam2 me1 aa3",
        isBookmarked: true,
        context: "Roleplay: Ordering kopi",
        languageCode: "yue-HK",
      })
    );
  });

  test("Save all saves every unsaved phrase once", () => {
    render(<RoleplayView scenario={SCENARIO} onBack={vi.fn()} />);

    click("End");
    click(/save all/i);

    expect(mockAddPhrase).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /saved to phrases/i })).toBeDisabled();
  });
});
