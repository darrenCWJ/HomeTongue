import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ConversationLesson, VocabItem } from "../../types";
import { LibraryProvider, useLibrary } from "./LibraryProvider";

// The bug under test (LEARN-01): `updateConversationLesson` took a whole
// lesson and replaced the stored record with it. Every caller therefore had to
// spread a lesson object it had captured earlier — and those snapshots go
// stale the moment any other write lands. The observed sequence: the phrase
// breakdown exercise writes API-enriched `vocabulary`, then the exam writes
// its score from a lesson captured before that enrichment, reverting it. The
// app then re-fetches every breakdown from OpenAI on the next open.
// The provider now takes `(id, patch)` and merges over CURRENT state, so a
// write can only ever change the fields it names.

const BASE_VOCAB: VocabItem[] = [
  { english: "one kopi", dialect: "一杯咖啡", romanization: "jat1 bui1 gaa3 fe1" },
];

const ENRICHED_VOCAB: VocabItem[] = [
  {
    ...BASE_VOCAB[0],
    breakdown: [{ characters: "一杯", pronunciation: "jat1 bui1", meaning: "one cup" }],
  },
];

const STORED_LESSON: ConversationLesson = {
  id: "lesson-1",
  sessionId: "session-1",
  title: "Ordering kopi",
  createdAt: "2026-01-01T00:00:00.000Z",
  vocabulary: BASE_VOCAB,
  examCompleted: false,
  examAttempts: 0,
  currentPhase: "listen",
};

const updateSpy = vi.fn();

vi.mock("../../repositories", () => ({
  isCloudStorageMode: false,
  setCloudWriteHold: vi.fn(),
  repositories: {
    phrases: { getAll: () => Promise.resolve([]) },
    conversations: { getAll: () => Promise.resolve([]) },
    lessons: { getAllProgress: () => Promise.resolve({}) },
    tags: { getAll: () => Promise.resolve([]) },
    conversationLessons: {
      getAll: () => Promise.resolve([STORED_LESSON]),
      update: (lesson: ConversationLesson) => {
        updateSpy(lesson);
        return Promise.resolve();
      },
    },
  },
}));

vi.mock("./AuthProvider", () => ({
  useAuth: () => ({ authEpoch: 0 }),
}));

vi.mock("../../lib/useSyncToasts", () => ({
  useSyncToasts: () => {},
}));

function LibraryProbe() {
  const { conversationLessons, updateConversationLesson } = useLibrary();
  const lesson = conversationLessons.find((l) => l.id === STORED_LESSON.id);
  return (
    <div>
      <span data-testid="breakdown">{lesson?.vocabulary[0]?.breakdown ? "enriched" : "bare"}</span>
      <span data-testid="phase">{lesson?.currentPhase ?? "(none)"}</span>
      <span data-testid="attempts">{lesson?.examAttempts ?? -1}</span>
      <button onClick={() => updateConversationLesson(STORED_LESSON.id, { vocabulary: ENRICHED_VOCAB })}>
        save breakdown
      </button>
      <button onClick={() => updateConversationLesson(STORED_LESSON.id, { currentPhase: "done" })}>
        save phase
      </button>
      <button onClick={() => updateConversationLesson(STORED_LESSON.id, { examAttempts: 1 })}>
        save exam
      </button>
      <button onClick={() => updateConversationLesson("no-such-lesson", { currentPhase: "done" })}>
        save unknown
      </button>
    </div>
  );
}

async function renderProvider() {
  const result = render(
    <LibraryProvider>
      <LibraryProbe />
    </LibraryProvider>
  );
  // Let the initial repository load resolve into state.
  await act(async () => {});
  return result;
}

const click = (label: string) => fireEvent.click(screen.getByRole("button", { name: label }));
const lastPersisted = () => updateSpy.mock.calls[updateSpy.mock.calls.length - 1][0] as ConversationLesson;

let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

// Vitest runs without `globals: true`, so RTL's automatic cleanup never
// registers — unmount explicitly or the previous tree stays mounted.
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("LibraryProvider.updateConversationLesson", () => {
  test("a later patch merges over current state instead of reverting an earlier one", async () => {
    // Arrange — the lesson is loaded with bare (un-enriched) vocabulary
    await renderProvider();
    expect(screen.getByTestId("breakdown")).toHaveTextContent("bare");

    // Act — the audit's sequence: enrich vocabulary, then write the exam result
    click("save breakdown");
    click("save exam");

    // Assert — the exam write changed only what it named
    expect(screen.getByTestId("breakdown")).toHaveTextContent("enriched");
    expect(screen.getByTestId("attempts")).toHaveTextContent("1");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test("persists the merged lesson, not just the patch", async () => {
    // Arrange
    await renderProvider();

    // Act
    click("save breakdown");
    click("save phase");

    // Assert — the repository replaces the whole row, so the object handed to
    // it must carry every field, including the previous write's enrichment
    expect(updateSpy).toHaveBeenCalledTimes(2);
    expect(lastPersisted()).toEqual({
      ...STORED_LESSON,
      vocabulary: ENRICHED_VOCAB,
      currentPhase: "done",
    });
  });

  test("leaves untouched fields alone when a patch names one field", async () => {
    // Arrange
    await renderProvider();

    // Act
    click("save phase");

    // Assert
    expect(screen.getByTestId("phase")).toHaveTextContent("done");
    expect(screen.getByTestId("attempts")).toHaveTextContent("0");
    expect(lastPersisted()).toEqual({ ...STORED_LESSON, currentPhase: "done" });
  });

  test("ignores a patch for a lesson that is not in state", async () => {
    // Arrange
    await renderProvider();

    // Act — e.g. the lesson was deleted in another tab before the write landed
    click("save unknown");

    // Assert — nothing invented, nothing written
    expect(updateSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId("phase")).toHaveTextContent("listen");
    expect(warnSpy).toHaveBeenCalledWith(
      "[library] updateConversationLesson ignored: unknown lesson no-such-lesson"
    );
  });
});
