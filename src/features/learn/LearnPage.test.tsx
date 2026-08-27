import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ConversationLesson } from "../../types";
import { LearnPage } from "./LearnPage";

// Folded item B (Task 4 review follow-ups):
// 1. The conversation-lesson and exam panes both render nothing without a
//    resolved lesson, so a lesson that disappeared underneath them (deleted
//    from another surface, a persona or language switch) left the user on a
//    blank screen with no way back.
// 2. handleExamComplete returned before setting the view when the lesson had
//    vanished, stranding the user on that blank exam pane.

const mockUpdateConversationLesson = vi.fn();

const libraryState = {
  lessonProgress: {},
  conversationLessons: [] as ConversationLesson[],
  updateConversationLesson: (...args: unknown[]) => mockUpdateConversationLesson(...args),
  deleteConversationLesson: vi.fn(),
};

vi.mock("../../app/context/LibraryProvider", () => ({
  useLibrary: () => libraryState,
}));

vi.mock("../../app/context/ProfileProvider", () => ({
  useProfile: () => ({ dialect: "Cantonese" }),
}));

vi.mock("../../hooks/useLessonContent", () => ({
  useLessonContent: () => ({ categories: [], lessons: [] }),
}));

vi.mock("./srs/useReviewQueue", () => ({
  useReviewQueue: () => ({
    dueCards: [],
    dueCount: 0,
    totalBookmarked: 0,
    isLoading: false,
    loadError: null,
    gradeCard: vi.fn(),
  }),
}));

vi.mock("../../app/components/LanguageFilter", () => ({
  LanguageFilter: () => null,
}));

vi.mock("../../services/roleplayService", () => ({
  hasRoleplayScenarios: () => false,
}));

vi.mock("./conversation-lesson/ConversationLessonView", () => ({
  ConversationLessonView: ({ onStartExam }: { onStartExam: () => void }) => (
    <div>
      <p>lesson view</p>
      <button onClick={onStartExam}>start exam</button>
    </div>
  ),
}));

vi.mock("./exam/ExamView", () => ({
  ExamView: ({ onComplete }: { onComplete: (score: number) => void }) => (
    <div>
      <p>exam view</p>
      <button onClick={() => onComplete(80)}>finish exam</button>
    </div>
  ),
}));

vi.mock("./roadmap/RoadmapView", () => ({ RoadmapView: () => null }));
vi.mock("./roadmap/LevelView", () => ({ LevelView: () => null }));
vi.mock("./srs/PracticeView", () => ({ PracticeView: () => null }));
vi.mock("./roleplay/ScenarioPicker", () => ({ ScenarioPicker: () => null }));
vi.mock("./roleplay/RoleplayView", () => ({ RoleplayView: () => null }));
vi.mock("./main/DailyReviewModal", () => ({ DailyReviewModal: () => null }));

const LESSON: ConversationLesson = {
  id: "lesson-1",
  sessionId: "session-1",
  title: "Ordering kopi",
  createdAt: "2026-01-01T00:00:00.000Z",
  vocabulary: [{ english: "one kopi", dialect: "一杯咖啡", romanization: "jat1 bui1 gaa3 fe1" }],
  examCompleted: false,
  examAttempts: 0,
};

const click = (name: RegExp | string) => fireEvent.click(screen.getByRole("button", { name }));

/**
 * Open the custom tab and enter the one conversation lesson on it. Awaited
 * because the page swaps panes through AnimatePresence's `mode="wait"`.
 */
async function openLesson() {
  click(/custom conversation/i);
  fireEvent.click(screen.getByText("Ordering kopi"));
  await screen.findByText("lesson view");
}

async function startExam() {
  click("start exam");
  await screen.findByText("exam view");
}

const onMainList = async () =>
  expect(await screen.findByRole("heading", { name: "Learn" })).toBeInTheDocument();

beforeEach(() => {
  libraryState.conversationLessons = [LESSON];
  mockUpdateConversationLesson.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("LearnPage vanished conversation lesson", () => {
  test("a lesson deleted while open falls back to the main list", async () => {
    const { rerender } = render(<LearnPage />);
    await openLesson();

    libraryState.conversationLessons = [];
    rerender(<LearnPage />);

    await onMainList();
    expect(screen.queryByText("lesson view")).not.toBeInTheDocument();
  });

  test("a lesson deleted while its exam is open falls back to the main list", async () => {
    const { rerender } = render(<LearnPage />);
    await openLesson();
    await startExam();

    libraryState.conversationLessons = [];
    rerender(<LearnPage />);

    await onMainList();
    expect(screen.queryByText("exam view")).not.toBeInTheDocument();
  });

  test("finishing an exam records the attempt and returns to the lesson", async () => {
    render(<LearnPage />);
    await openLesson();
    await startExam();
    click("finish exam");

    expect(mockUpdateConversationLesson).toHaveBeenCalledWith("lesson-1", {
      examAttempts: 1,
      examBestScore: 80,
      examCompleted: true,
    });
    expect(await screen.findByText("lesson view")).toBeInTheDocument();
  });
});
