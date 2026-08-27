import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { Message, Phrase } from "../../../types";
import type { PreparedTranslation } from "../utils/prepareTranslation";
import type { RecordRef } from "./useMicRecording";
import { useReplyFlow } from "./useReplyFlow";

// CHAT-04 — translation takes seconds; a New Chat or Save landing during that
// window used to append the dead conversation's reply into the fresh chat.
// Both reply paths now capture the chat epoch before awaiting and discard
// their result if the conversation was reset while they were in flight.

const mockPrepareTranslation = vi.fn();
const mockToastError = vi.fn();

vi.mock("../utils/prepareTranslation", () => ({
  prepareTranslation: (...args: unknown[]) => mockPrepareTranslation(...args),
}));

vi.mock("../../../services/speechSampleService", () => ({
  recordCorrection: vi.fn(),
  consentFromProfile: vi.fn(() => false),
}));

vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args), success: vi.fn() },
}));

const PHRASE: Phrase = {
  id: "p1",
  original: "thank you",
  dialect: "多謝",
  pronunciation: "do1 ze6",
  isBookmarked: false,
  context: "",
};

function preparedTranslation(): PreparedTranslation {
  return {
    phrase: PHRASE,
    audioDataUrl: "data:audio/mp3;base64,AAA",
    play: vi.fn(() => Promise.resolve()),
    variants: {
      formal: { text: "多謝", pronunciation: "do1 ze6" },
      casual: { text: "多謝", pronunciation: "do1 ze6" },
      slang: { text: "多謝", pronunciation: "do1 ze6" },
    },
  };
}

/** A promise plus its resolver, so a test can hold a translation mid-flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup() {
  const addPhrase = vi.fn<(phrase: Phrase) => void>();
  const addMessage = vi.fn<(msg: Message) => void>();
  const setPlayingId = vi.fn<(id: string | null) => void>();
  const setLatestSuggestions = vi.fn<(suggestions: Phrase[]) => void>();
  const setStage = vi.fn<(stage: "transcribing" | "translating" | null) => void>();
  const chatEpochRef = { current: 0 };
  const lastRecordRef = { current: null as RecordRef | null };
  const prefetchCacheRef = { current: new Map<string, Promise<PreparedTranslation>>() };
  const { result } = renderHook(() =>
    useReplyFlow({
      tone: "casual",
      userProfile: null,
      addPhrase,
      addMessage,
      setStage,
      setStageIsUserSide: vi.fn(),
      setPlayingId,
      setLatestSuggestions,
      lastRecordRef,
      prefetchCacheRef,
      chatEpochRef,
    })
  );
  return { result, addPhrase, addMessage, setPlayingId, setStage, chatEpochRef };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("useReplyFlow chat-epoch guard", () => {
  test("a chip reply that finishes in the same conversation is added", async () => {
    const { result, addPhrase, addMessage, setPlayingId, setStage } = setup();
    const translation = deferred<PreparedTranslation>();
    mockPrepareTranslation.mockReturnValue(translation.promise);

    act(() => void result.current.handleReply("thank you"));
    await act(async () => {
      translation.resolve(preparedTranslation());
      await flush();
    });

    expect(addPhrase).toHaveBeenCalledWith(PHRASE);
    expect(addMessage).toHaveBeenCalledWith(expect.objectContaining({ id: "p1", text: "thank you" }));
    expect(setPlayingId).toHaveBeenCalledWith("p1");
    expect(setStage).toHaveBeenCalledWith(null);
  });

  test("a chip reply is discarded when the conversation resets mid-translation", async () => {
    const { result, addPhrase, addMessage, setPlayingId, setStage, chatEpochRef } = setup();
    const translation = deferred<PreparedTranslation>();
    mockPrepareTranslation.mockReturnValue(translation.promise);

    act(() => void result.current.handleReply("thank you"));
    // New Chat / Save / dialect switch lands while the translation is in flight
    chatEpochRef.current += 1;
    await act(async () => {
      translation.resolve(preparedTranslation());
      await flush();
    });

    expect(addPhrase).not.toHaveBeenCalled();
    expect(addMessage).not.toHaveBeenCalled();
    expect(setPlayingId).not.toHaveBeenCalledWith("p1");
    expect(mockToastError).not.toHaveBeenCalled();
    // The reset already cleared the stage; clearing it again would wipe the
    // indicator of whatever the fresh conversation is doing now.
    expect(setStage).not.toHaveBeenCalledWith(null);
  });

  test("a confirmed English transcript is discarded when the conversation resets mid-translation", async () => {
    const { result, addPhrase, addMessage, setStage, chatEpochRef } = setup();
    const translation = deferred<PreparedTranslation>();
    act(() =>
      result.current.setPendingEnglish({ text: "thank you", resultPromise: translation.promise })
    );

    act(() => void result.current.confirmEnglishReply());
    chatEpochRef.current += 1;
    await act(async () => {
      translation.resolve(preparedTranslation());
      await flush();
    });

    expect(addPhrase).not.toHaveBeenCalled();
    expect(addMessage).not.toHaveBeenCalled();
    expect(setStage).not.toHaveBeenCalledWith(null);
  });

  test("a confirmed English transcript in the same conversation is added", async () => {
    const { result, addPhrase, addMessage } = setup();
    const translation = deferred<PreparedTranslation>();
    act(() =>
      result.current.setPendingEnglish({ text: "thank you", resultPromise: translation.promise })
    );

    act(() => void result.current.confirmEnglishReply());
    await act(async () => {
      translation.resolve(preparedTranslation());
      await flush();
    });

    expect(addPhrase).toHaveBeenCalledWith(PHRASE);
    expect(addMessage).toHaveBeenCalledWith(expect.objectContaining({ id: "p1", text: "thank you" }));
  });
});
