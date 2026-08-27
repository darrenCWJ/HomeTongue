import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, afterEach } from "vitest";
import type { ComponentProps } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import type { Phrase, Tag } from "../../../types";
import { PhraseCard } from "./PhraseCard";

// BM-04 — the filter bars hid tags inside their 5s undo window, but the card
// tag editors did not: a tag could be assigned to a phrase moments before the
// delete committed, leaving a dangling tag id on the phrase.
// Folded item A (Task 10) — the attached-tag BADGES above the dialect text
// still resolved names from the unfiltered tag list, so a doomed tag showed
// as a badge even though the editor correctly hid its chip.
// BM-02 (Task 10) — on a voice-less pack (tts capability off), the speaker
// button "succeeded" silently for a phrase with no stored audio. It is now
// hidden for that case, matching Learn's PlayButton gate.
// BM-10 (Task 10) — the speaker button now dims while disabled, mirroring
// SessionViewer's play-control affordance.

const FOOD: Tag = { id: "t1", name: "Food", type: "phrase", createdAt: "2026-01-01T00:00:00.000Z" };
const DRINKS: Tag = {
  id: "t2",
  name: "Drinks",
  type: "phrase",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const PHRASE: Phrase = {
  id: "p1",
  original: "one kopi please",
  dialect: "一杯咖啡",
  pronunciation: "jat1 bui1 gaa3 fe1",
  isBookmarked: true,
  context: "hawker centre",
  tags: ["t2"],
};

function renderCard(overrides: Partial<ComponentProps<typeof PhraseCard>> = {}) {
  render(
    <PhraseCard
      phrase={PHRASE}
      isFirst
      phraseTags={[FOOD, DRINKS]}
      pendingTagDeletions={new Set()}
      editingTagsPhraseId={PHRASE.id}
      setEditingTagsPhraseId={vi.fn()}
      playingId={null}
      onSpeak={vi.fn()}
      updatePhrase={vi.fn()}
      setPhraseTags={vi.fn()}
      ttsEnabled={true}
      {...overrides}
    />
  );
}

afterEach(cleanup);

describe("PhraseCard tag editor", () => {
  test("a tag inside its undo window cannot be assigned", () => {
    renderCard({ pendingTagDeletions: new Set(["t1"]) });

    expect(screen.queryByRole("button", { name: "Food" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Drinks" })).toBeInTheDocument();
  });

  test("all tags are assignable when nothing is pending deletion", () => {
    renderCard();

    expect(screen.getByRole("button", { name: "Food" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Drinks" })).toBeInTheDocument();
  });
});

describe("PhraseCard tag badges (folded item A)", () => {
  test("an attached tag inside its undo window does not render as a badge", () => {
    renderCard({
      phrase: { ...PHRASE, tags: ["t1", "t2"] },
      pendingTagDeletions: new Set(["t1"]),
      editingTagsPhraseId: null,
    });

    expect(screen.queryByText("Food")).not.toBeInTheDocument();
    expect(screen.getByText("Drinks")).toBeInTheDocument();
  });

  test("an attached tag not pending deletion still renders as a badge", () => {
    renderCard({
      phrase: { ...PHRASE, tags: ["t1", "t2"] },
      pendingTagDeletions: new Set(),
      editingTagsPhraseId: null,
    });

    expect(screen.getByText("Food")).toBeInTheDocument();
    expect(screen.getByText("Drinks")).toBeInTheDocument();
  });
});

describe("PhraseCard play control (BM-02, BM-10)", () => {
  const NO_AUDIO: Phrase = { ...PHRASE, audioDataUrl: undefined, audioDataUrls: undefined };
  const WITH_AUDIO: Phrase = { ...PHRASE, audioDataUrl: "data:audio/wav;base64,AAA" };

  test("hides the play control when there is no stored audio and TTS is unavailable", () => {
    renderCard({ phrase: NO_AUDIO, ttsEnabled: false, editingTagsPhraseId: null });

    expect(screen.queryByRole("button", { name: "Play pronunciation" })).not.toBeInTheDocument();
  });

  test("shows the play control when TTS is available even with no stored audio", () => {
    renderCard({ phrase: NO_AUDIO, ttsEnabled: true, editingTagsPhraseId: null });

    expect(screen.getByRole("button", { name: "Play pronunciation" })).toBeInTheDocument();
  });

  test("shows the play control for stored audio even when TTS is unavailable", () => {
    renderCard({ phrase: WITH_AUDIO, ttsEnabled: false, editingTagsPhraseId: null });

    expect(screen.getByRole("button", { name: "Play pronunciation" })).toBeInTheDocument();
  });

  test("the play control dims while any playback is in-flight", () => {
    renderCard({
      phrase: WITH_AUDIO,
      ttsEnabled: false,
      playingId: "some-other-id",
      editingTagsPhraseId: null,
    });

    const button = screen.getByRole("button", { name: "Play pronunciation" });
    expect(button).toBeDisabled();
    expect(button).toHaveClass("disabled:opacity-40");
  });
});
