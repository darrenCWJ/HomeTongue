import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { Phrase, PhraseReviewState } from "../../../types";
import { useReviewQueue } from "./useReviewQueue";

// useReviewQueue epoch — the load effect ran once on mount with an empty dep
// array, so signing in, signing out, or switching users left the SRS queue
// showing the previous account's schedule until a full page reload. It now
// follows `authEpoch`, the same signal the providers reload on.

const mockGetAll = vi.fn();
const mockPut = vi.fn<(row: PhraseReviewState) => Promise<void>>(() => Promise.resolve());

let phrases: Phrase[] = [];
let authEpoch = 0;

vi.mock("../../../app/context/LibraryProvider", () => ({
  useLibrary: () => ({ phrases }),
}));

vi.mock("../../../app/context/AuthProvider", () => ({
  useAuth: () => ({ authEpoch }),
}));

vi.mock("../../../hooks/useActiveLanguageCode", () => ({
  useActiveLanguageCode: () => "yue-HK",
}));

vi.mock("../../../repositories", () => ({
  repositories: {
    reviewStates: {
      getAll: () => mockGetAll(),
      put: (row: PhraseReviewState) => mockPut(row),
    },
  },
}));

const bookmarked = (id: string): Phrase => ({
  id,
  original: "one kopi",
  dialect: "一杯咖啡",
  pronunciation: "jat1 bui1 gaa3 fe1",
  isBookmarked: true,
  context: "",
  languageCode: "yue-HK",
});

/** A schedule far enough out that the card is NOT due. */
const scheduled = (phraseId: string): PhraseReviewState => ({
  phraseId,
  due: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  intervalDays: 7,
  ease: 2.5,
  reps: 3,
  lapses: 0,
  updatedAt: new Date().toISOString(),
});

const flush = () => act(async () => await Promise.resolve());

beforeEach(() => {
  phrases = [];
  authEpoch = 0;
  mockGetAll.mockReset();
  mockGetAll.mockResolvedValue([]);
  mockPut.mockClear();
});

afterEach(() => {
  cleanup();
});

describe("useReviewQueue auth epoch", () => {
  test("reloads the schedule when the signed-in user changes", async () => {
    phrases = [bookmarked("p1")];
    // The first user has already reviewed p1; the next user has not.
    mockGetAll.mockResolvedValueOnce([scheduled("p1")]).mockResolvedValueOnce([]);
    const { result, rerender } = renderHook(() => useReviewQueue());
    await flush();

    expect(mockGetAll).toHaveBeenCalledTimes(1);
    expect(result.current.dueCount).toBe(0);

    authEpoch = 1;
    rerender();
    await flush();

    expect(mockGetAll).toHaveBeenCalledTimes(2);
    expect(result.current.dueCount).toBe(1);
  });

  test("a re-render without an auth change does not reload", async () => {
    phrases = [bookmarked("p1")];
    const { rerender } = renderHook(() => useReviewQueue());
    await flush();

    rerender();
    await flush();

    expect(mockGetAll).toHaveBeenCalledTimes(1);
  });

  test("a load failure is surfaced and cleared by the next user's load", async () => {
    mockGetAll.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([]);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result, rerender } = renderHook(() => useReviewQueue());
    await flush();

    expect(result.current.loadError).toBe("Could not load your practice schedule.");

    authEpoch = 1;
    rerender();
    await flush();

    expect(result.current.loadError).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  test("grading a card persists the new schedule", async () => {
    phrases = [bookmarked("p1")];
    const { result } = renderHook(() => useReviewQueue());
    await flush();

    expect(result.current.dueCount).toBe(1);
    act(() => {
      result.current.gradeCard(result.current.dueCards[0], "good");
    });

    expect(mockPut).toHaveBeenCalledWith(expect.objectContaining({ phraseId: "p1" }));
    expect(result.current.dueCount).toBe(0);
  });
});
