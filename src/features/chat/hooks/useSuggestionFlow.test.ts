import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { Message, Phrase } from "../../../types";
import type { RecordRef } from "./useMicRecording";
import { useSuggestionFlow } from "./useSuggestionFlow";

// CHAT-13 — fetchSuggestions removed the previous suggestion message but left
// the old chips sitting in latestSuggestions until the new fetch resolved. A
// refresh that came back empty or rejected then left those stale chips on
// screen, pointing at a suggestion message that was already gone. Chips are
// now cleared synchronously the moment a new fetch starts, before the
// network call — the existing generation guard still drops a superseded
// fetch's late result.

const mockGetSuggestions = vi.fn();
const mockPrepareTranslation = vi.fn();

vi.mock("../../../services/suggestionService", () => ({
  getSuggestions: (...args: unknown[]) => mockGetSuggestions(...args),
}));

vi.mock("../utils/prepareTranslation", () => ({
  prepareTranslation: (...args: unknown[]) => mockPrepareTranslation(...args),
}));

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A promise plus its resolver/rejecter, so a test can hold a fetch mid-flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const CHIP: Phrase = {
  id: "suggestion-1",
  original: "thank you",
  dialect: "多謝",
  pronunciation: "do1 ze6",
  isBookmarked: false,
  context: "polite",
};

const CHIP_2: Phrase = {
  id: "suggestion-2",
  original: "you're welcome",
  dialect: "唔使客氣",
  pronunciation: "m4 sai2 haak3 hei3",
  isBookmarked: false,
  context: "polite",
};

function setup() {
  const removeMessage = vi.fn();
  const addBotSuggestions = vi.fn();
  const lastRecordRef = { current: null as RecordRef | null };
  const messagesRef = { current: [] as Message[] };
  const { result } = renderHook(() =>
    useSuggestionFlow({
      messages: [],
      phrases: [],
      activeLanguageCode: "yue-HK",
      tone: "casual",
      userProfile: null,
      activePersona: "personal",
      removeMessage,
      addBotSuggestions,
      lastRecordRef,
      messagesRef,
    })
  );
  return { result, removeMessage, addBotSuggestions, lastRecordRef, messagesRef };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrepareTranslation.mockReturnValue(new Promise(() => {})); // fire-and-forget prefetch; never needs to settle
});

afterEach(cleanup);

describe("useSuggestionFlow stale-chip clearing (CHAT-13)", () => {
  test("a new fetch clears the previous chips synchronously, before the network call settles", async () => {
    const { result } = setup();
    mockGetSuggestions.mockResolvedValueOnce([CHIP]);
    act(() => result.current.fetchSuggestions("first message"));
    await act(async () => await flush());
    expect(result.current.latestSuggestions).toEqual([CHIP]);

    const secondFetch = deferred<Phrase[]>();
    mockGetSuggestions.mockReturnValueOnce(secondFetch.promise);
    act(() => result.current.fetchSuggestions("second message"));

    // Cleared immediately — the second fetch has not settled at all yet.
    expect(result.current.latestSuggestions).toEqual([]);

    await act(async () => {
      secondFetch.resolve([]);
      await flush();
    });
  });

  test("a fetch that resolves empty leaves no stale chips visible", async () => {
    const { result } = setup();
    mockGetSuggestions.mockResolvedValueOnce([CHIP]);
    act(() => result.current.fetchSuggestions("first message"));
    await act(async () => await flush());
    expect(result.current.latestSuggestions).toEqual([CHIP]);

    mockGetSuggestions.mockResolvedValueOnce([]);
    await act(async () => {
      result.current.fetchSuggestions("second message");
      await flush();
    });

    expect(result.current.latestSuggestions).toEqual([]);
  });

  test("a fetch that rejects leaves no stale chips visible", async () => {
    const { result } = setup();
    mockGetSuggestions.mockResolvedValueOnce([CHIP]);
    act(() => result.current.fetchSuggestions("first message"));
    await act(async () => await flush());
    expect(result.current.latestSuggestions).toEqual([CHIP]);

    mockGetSuggestions.mockRejectedValueOnce(new Error("network down"));
    await act(async () => {
      result.current.fetchSuggestions("second message");
      await flush();
    });

    expect(result.current.latestSuggestions).toEqual([]);
  });

  // Coordinator round-2 MINOR — the second fetch here used to resolve []
  // (empty), so the final assertion held whether or not the generation
  // guard actually worked: latestSuggestions was already [] from the
  // synchronous clear and nothing in the test could ever have moved it,
  // since chips.length === 0 short-circuits before the guard is even
  // relevant. The second fetch now resolves non-empty (CHIP_2) so its own
  // chips visibly land first, and the stale first fetch resolves non-empty
  // too (CHIP) — only the generation guard, not the empty-result early
  // return, can be responsible for the first fetch's late chips never
  // overwriting the second fetch's already-landed ones.
  test("a superseded fetch's late resolution does not overwrite the fetch that replaced it", async () => {
    const { result } = setup();
    const firstFetch = deferred<Phrase[]>();
    mockGetSuggestions.mockReturnValueOnce(firstFetch.promise);
    act(() => result.current.fetchSuggestions("first message"));

    mockGetSuggestions.mockResolvedValueOnce([CHIP_2]);
    await act(async () => {
      result.current.fetchSuggestions("second message");
      await flush();
    });
    // The second fetch's own chips must have landed — otherwise the next
    // assertion (still CHIP_2 after the stale resolve) would hold
    // vacuously regardless of whether the generation guard does anything.
    expect(result.current.latestSuggestions).toEqual([CHIP_2]);

    // The stale first fetch finally resolves after being superseded.
    await act(async () => {
      firstFetch.resolve([CHIP]);
      await flush();
    });

    expect(result.current.latestSuggestions).toEqual([CHIP_2]);
  });
});
