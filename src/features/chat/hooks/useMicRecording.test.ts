import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { Message, Phrase } from "../../../types";
import { useMicRecording, type RecordRef } from "./useMicRecording";

// CHAT-04 (mic half) — transcription and dialect→English translation take
// seconds. A New Chat / Save / dialect switch landing in that window used to
// still write the finished turn: a message appended to a conversation that no
// longer exists, a phrase rewritten in the library, chips fetched for it.
// stopListening now captures the chat epoch and drops those writes when the
// conversation was reset underneath it.

const mockTranscribeDialect = vi.fn();
const mockTranscribeEnglish = vi.fn();
const mockTranslateDialectToEnglish = vi.fn();
const mockScoreDialectAccuracyDetailed = vi.fn(() => Promise.resolve({ score: 1, method: "llm" }));
const mockPrepareTranslation = vi.fn();
const mockStopRecording = vi.fn(() => Promise.resolve(new Blob(["x"])));

vi.mock("../../../hooks/audio", () => ({
  useAudioRecorder: () => ({
    startRecording: () => Promise.resolve(),
    stopRecording: () => mockStopRecording(),
  }),
  blobToDataUrl: () => Promise.resolve("data:audio/webm;base64,AAA"),
}));

vi.mock("../../../services/translationService", () => ({
  transcribeDialect: (...args: unknown[]) => mockTranscribeDialect(...args),
  transcribeEnglish: (...args: unknown[]) => mockTranscribeEnglish(...args),
  translateDialectToEnglish: (...args: unknown[]) => mockTranslateDialectToEnglish(...args),
  scoreDialectAccuracyDetailed: () => mockScoreDialectAccuracyDetailed(),
}));

vi.mock("../utils/prepareTranslation", () => ({
  prepareTranslation: (...args: unknown[]) => mockPrepareTranslation(...args),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

/** A promise plus its resolver, so a test can hold a request mid-flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let now = 1_000_000;

function setup() {
  const addPhrase = vi.fn<(phrase: Phrase) => void>();
  const updatePhrase = vi.fn<(phrase: Phrase) => void>();
  const addMessage = vi.fn<(msg: Message) => void>();
  const updateMessage = vi.fn<(id: string, updates: Partial<Message>) => void>();
  const fetchSuggestions = vi.fn();
  const setPendingEnglish = vi.fn();
  const setStage = vi.fn<(stage: "transcribing" | "translating" | null) => void>();
  const chatEpochRef = { current: 0 };
  const lastRecordRef = { current: null as RecordRef | null };
  const { result } = renderHook(() =>
    useMicRecording({
      phrases: [],
      addPhrase,
      updatePhrase,
      addMessage,
      updateMessage,
      activeLanguageCode: "yue-HK",
      tone: "casual",
      userProfile: null,
      lastRecordRef,
      messagesRef: { current: [] },
      fetchSuggestions,
      setLatestSuggestions: vi.fn(),
      setStage,
      setStageIsUserSide: vi.fn(),
      setPendingEnglish,
      setPendingEditText: vi.fn(),
      chatEpochRef,
    })
  );
  return {
    result,
    addPhrase,
    updatePhrase,
    addMessage,
    updateMessage,
    fetchSuggestions,
    setPendingEnglish,
    setStage,
    chatEpochRef,
    lastRecordRef,
  };
}

/** Hold the mic long enough to count as a real recording, then release it. */
async function recordAndRelease(
  result: { current: ReturnType<typeof useMicRecording> },
  mode: "cantonese" | "english"
) {
  const start = mode === "cantonese" ? result.current.startListeningCantonese : result.current.startListeningEnglish;
  await act(async () => {
    await result.current.handleMicPointerDown(start, mode);
  });
  now += 1500;
  await act(async () => {
    result.current.handleMicPointerUp(mode);
    await flush();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  now = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useMicRecording chat-epoch guard", () => {
  test("a dialect turn that finishes in the same conversation is added", async () => {
    const { result, addPhrase, addMessage, fetchSuggestions, setStage } = setup();
    mockTranscribeDialect.mockResolvedValue("早晨");
    mockTranslateDialectToEnglish.mockResolvedValue("good morning");

    await recordAndRelease(result, "cantonese");
    await act(async () => await flush());

    expect(addPhrase).toHaveBeenCalledWith(expect.objectContaining({ dialect: "早晨" }));
    expect(addMessage).toHaveBeenCalledWith(expect.objectContaining({ text: "早晨", sender: "bot" }));
    expect(fetchSuggestions).toHaveBeenCalledWith("good morning", null);
    expect(setStage).toHaveBeenCalledWith(null);
  });

  test("a dialect turn is discarded when the conversation resets mid-transcription", async () => {
    const { result, addPhrase, addMessage, fetchSuggestions, setStage, chatEpochRef } = setup();
    const transcription = deferred<string>();
    mockTranscribeDialect.mockReturnValue(transcription.promise);

    await recordAndRelease(result, "cantonese");
    chatEpochRef.current += 1;
    await act(async () => {
      transcription.resolve("早晨");
      await flush();
    });

    expect(mockTranslateDialectToEnglish).not.toHaveBeenCalled();
    expect(addPhrase).not.toHaveBeenCalled();
    expect(addMessage).not.toHaveBeenCalled();
    expect(fetchSuggestions).not.toHaveBeenCalled();
    // The reset already cleared the stage; clearing it again would wipe the
    // indicator of whatever the fresh conversation is doing now.
    expect(setStage).not.toHaveBeenCalledWith(null);
  });

  test("a first dialect turn is discarded when the conversation resets mid-translation", async () => {
    const { result, addPhrase, addMessage, fetchSuggestions, chatEpochRef, lastRecordRef } = setup();
    expect(lastRecordRef.current).toBeNull(); // no append window: this is a fresh turn
    mockTranscribeDialect.mockResolvedValue("早晨");
    const translation = deferred<string>();
    mockTranslateDialectToEnglish.mockReturnValue(translation.promise);

    await recordAndRelease(result, "cantonese");
    chatEpochRef.current += 1;
    await act(async () => {
      translation.resolve("good morning");
      await flush();
    });

    expect(addPhrase).not.toHaveBeenCalled();
    expect(addMessage).not.toHaveBeenCalled();
    expect(fetchSuggestions).not.toHaveBeenCalled();
  });

  test("an appended dialect turn is discarded when the conversation resets mid-translation", async () => {
    const { result, updateMessage, updatePhrase, fetchSuggestions, chatEpochRef, lastRecordRef } = setup();
    lastRecordRef.current = {
      msgId: "m1",
      suggestionMsgId: "sug-1",
      mode: "cantonese",
      timestamp: now,
      fullText: "早晨",
      audioDataUrls: ["data:audio/webm;base64,BBB"],
    };
    mockTranscribeDialect.mockResolvedValue("食咗飯未");
    const translation = deferred<string>();
    mockTranslateDialectToEnglish.mockReturnValue(translation.promise);

    await recordAndRelease(result, "cantonese");
    chatEpochRef.current += 1;
    await act(async () => {
      translation.resolve("good morning, have you eaten");
      await flush();
    });

    expect(updateMessage).not.toHaveBeenCalled();
    expect(updatePhrase).not.toHaveBeenCalled();
    expect(fetchSuggestions).not.toHaveBeenCalled();
  });

  test("an English transcript is discarded when the conversation resets mid-transcription", async () => {
    const { result, setPendingEnglish, chatEpochRef } = setup();
    const transcription = deferred<string>();
    mockTranscribeEnglish.mockReturnValue(transcription.promise);

    await recordAndRelease(result, "english");
    chatEpochRef.current += 1;
    await act(async () => {
      transcription.resolve("one kopi please");
      await flush();
    });

    expect(mockPrepareTranslation).not.toHaveBeenCalled();
    expect(setPendingEnglish).not.toHaveBeenCalled();
  });
});
