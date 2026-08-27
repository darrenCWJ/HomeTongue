import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Phrase, Tag } from "../../../types";
import { PhraseCard } from "./PhraseCard";

// BM-04 — the filter bars hid tags inside their 5s undo window, but the card
// tag editors did not: a tag could be assigned to a phrase moments before the
// delete committed, leaving a dangling tag id on the phrase.

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

function renderCard(pendingTagDeletions: Set<string>) {
  render(
    <PhraseCard
      phrase={PHRASE}
      isFirst
      phraseTags={[FOOD, DRINKS]}
      pendingTagDeletions={pendingTagDeletions}
      editingTagsPhraseId={PHRASE.id}
      setEditingTagsPhraseId={vi.fn()}
      playingId={null}
      onSpeak={vi.fn()}
      updatePhrase={vi.fn()}
      setPhraseTags={vi.fn()}
    />
  );
}

afterEach(cleanup);

describe("PhraseCard tag editor", () => {
  test("a tag inside its undo window cannot be assigned", () => {
    renderCard(new Set(["t1"]));

    expect(screen.queryByRole("button", { name: "Food" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Drinks" })).toBeInTheDocument();
  });

  test("all tags are assignable when nothing is pending deletion", () => {
    renderCard(new Set<string>());

    expect(screen.getByRole("button", { name: "Food" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Drinks" })).toBeInTheDocument();
  });
});
