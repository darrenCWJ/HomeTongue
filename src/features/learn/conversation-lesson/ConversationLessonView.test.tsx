import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ConversationLesson, VocabItem, WordChunk } from "../../../types";
import { ConversationLessonView } from "./ConversationLessonView";

// Two bugs under test:
// LEARN-02 — finishing the flashcards only moved local state, so the phase was
//   never persisted: reopening the lesson dropped the user back to the
//   flashcards, while the "Skip" button next to it saved correctly.
// LEARN-01 — both writes spread a captured `lesson` snapshot into a
//   whole-object replace, so whichever write landed last reverted the other.
//   They must now send a patch naming only the fields they change.

const BASE_VOCAB: VocabItem[] = [
  { english: "one kopi", dialect: "一杯咖啡", romanization: "jat1 bui1 gaa3 fe1" },
];

const BREAKDOWN: WordChunk[] = [{ characters: "一杯", pronunciation: "jat1 bui1", meaning: "one cup" }];

const LESSON: ConversationLesson = {
  id: "lesson-1",
  sessionId: "session-1",
  title: "Ordering kopi",
  createdAt: "2026-01-01T00:00:00.000Z",
  vocabulary: BASE_VOCAB,
  examCompleted: false,
  examAttempts: 0,
  currentPhase: "listen",
};

const mockUpdate = vi.fn();

vi.mock("../../../app/context/LibraryProvider", () => ({
  useLibrary: () => ({ updateConversationLesson: mockUpdate }),
}));

// Child stubs: this file tests the view's persistence wiring, not the
// exercises themselves. Each exposes a button that fires its completion prop.
vi.mock("./PhraseBreakdownExercise", () => ({
  PhraseBreakdownExercise: ({ onComplete }: { onComplete: (c: Record<number, WordChunk[]>) => void }) => (
    <button onClick={() => onComplete({ 0: BREAKDOWN })}>finish breakdown</button>
  ),
}));

vi.mock("./ConvFlashcardExercise", () => ({
  ConvFlashcardExercise: ({ onComplete }: { onComplete: () => void }) => (
    <button onClick={onComplete}>finish flashcards</button>
  ),
}));

function renderView(lesson: ConversationLesson = LESSON) {
  return render(<ConversationLessonView lesson={lesson} onBack={vi.fn()} onStartExam={vi.fn()} />);
}

const click = (label: RegExp | string) => fireEvent.click(screen.getByRole("button", { name: label }));

beforeEach(() => {
  vi.clearAllMocks();
});

// Vitest runs without `globals: true`, so RTL's automatic cleanup never
// registers — unmount explicitly or the previous tree stays mounted.
afterEach(() => {
  cleanup();
});

describe("ConversationLessonView phase persistence", () => {
  test("finishing the flashcards persists the done phase", () => {
    // Arrange — the user is on the flashcard phase
    renderView({ ...LESSON, currentPhase: "flashcard" });

    // Act — they work through every card instead of skipping
    click("finish flashcards");

    // Assert — the same write the Skip button makes
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith("lesson-1", { currentPhase: "done" });
    expect(screen.getByText("Ready for the Exam!")).toBeInTheDocument();
  });

  test("skipping the flashcards persists the done phase", () => {
    // Arrange
    renderView({ ...LESSON, currentPhase: "flashcard" });

    // Act
    click(/skip/i);

    // Assert
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith("lesson-1", { currentPhase: "done" });
  });

  test("saves the breakdown enrichment as a patch, not a whole-lesson replace", () => {
    // Arrange — the listen phase, where breakdowns are fetched
    renderView();

    // Act
    click("finish breakdown");

    // Assert — only the fields this step owns
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith("lesson-1", {
      vocabulary: [{ ...BASE_VOCAB[0], breakdown: BREAKDOWN }],
      currentPhase: "flashcard",
    });
    expect(screen.getByRole("button", { name: "finish flashcards" })).toBeInTheDocument();
  });

  test("skipping the listen phase persists the flashcard phase", () => {
    // Arrange
    renderView();

    // Act
    click(/skip/i);

    // Assert
    expect(mockUpdate).toHaveBeenCalledWith("lesson-1", { currentPhase: "flashcard" });
  });
});
