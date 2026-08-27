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
//
// CHAT-01 — the Dialect mic is the only control that can stop a dialect
// recording, and ActionBar unmounts it when the new pack has no stt model.
// Switching dialect mid-recording therefore left the mic hot with no way to
// release it; the switch now stops the recording itself.
// CHAT-06 — the append branch read the phrase list captured at render, so a
// bookmark or tag applied while the transcription was in flight was written
// back over. It now reads the live ref at write time and merges.
// CHAT-10 — the English mic cleared the visible chips before asking for
// permission, so a denied mic ate reply chips the user could still tap.

const mockTranscribeDialect = vi.fn();
const mockTranscribeEnglish = vi.fn();
const mockTranslateDialectToEnglish = vi.fn();
const mockScoreDialectAccuracyDetailed = vi.fn(() => Promise.resolve({ score: 1, method: "llm" }));
const mockPrepareTranslation = vi.fn();
const mockStartRecording = vi.fn(() => Promise.resolve());
const mockStopRecording = vi.fn(() => Promise.resolve(new Blob(["x"])));

vi.mock("../../../hooks/audio", () => ({
  useAudioRecorder: () => ({
    startRecording: () => mockStartRecording(),
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

/** The phrase a first dialect turn leaves behind, after the user bookmarks and tags it. */
const BOOKMARKED_PHRASE: Phrase = {
  id: "m1",
  original: "good morning",
  dialect: "早晨",
  pronunciation: "zou2 san4",
  isBookmarked: true,
  context: "greeting",
  tags: ["t1"],
  createdAt: "2026-01-01T00:00:00.000Z",
  audioDataUrl: "data:audio/webm;base64,BBB",
  audioDataUrls: ["data:audio/webm;base64,BBB"],
  languageCode: "yue-HK",
};

function openAppendWindow(): RecordRef {
  return {
    msgId: "m1",
    suggestionMsgId: "sug-1",
    mode: "cantonese",
    timestamp: now,
    fullText: "早晨",
    audioDataUrls: ["data:audio/webm;base64,BBB"],
  };
}

function setup() {
  const addPhrase = vi.fn<(phrase: Phrase) => void>();
  const updatePhrase = vi.fn<(phrase: Phrase) => void>();
  const addMessage = vi.fn<(msg: Message) => void>();
  const updateMessage = vi.fn<(id: string, updates: Partial<Message>) => void>();
  const fetchSuggestions = vi.fn();
  const setLatestSuggestions = vi.fn<(suggestions: Phrase[]) => void>();
  const setPendingEnglish = vi.fn();
  const setStage = vi.fn<(stage: "transcribing" | "translating" | null) => void>();
  const chatEpochRef = { current: 0 };
  const lastRecordRef = { current: null as RecordRef | null };
  const messagesRef = { current: [] as Message[] };
  const phrasesRef = { current: [] as Phrase[] };
  const { result, rerender } = renderHook(
    ({ languageCode }: { languageCode: string }) =>
      useMicRecording({
        phrasesRef,
        addPhrase,
        updatePhrase,
        addMessage,
        updateMessage,
        activeLanguageCode: languageCode,
        tone: "casual",
        userProfile: null,
        lastRecordRef,
        messagesRef,
        fetchSuggestions,
        setLatestSuggestions,
        setStage,
        setStageIsUserSide: vi.fn(),
        setPendingEnglish,
        setPendingEditText: vi.fn(),
        chatEpochRef,
      }),
    { initialProps: { languageCode: "yue-HK" } }
  );
  return {
    result,
    rerender,
    addPhrase,
    updatePhrase,
    addMessage,
    updateMessage,
    fetchSuggestions,
    setLatestSuggestions,
    setPendingEnglish,
    setStage,
    chatEpochRef,
    lastRecordRef,
    messagesRef,
    phrasesRef,
  };
}

/** Press and hold the mic long enough to count as a real recording. */
async function startRecordingFor(
  result: { current: ReturnType<typeof useMicRecording> },
  mode: "cantonese" | "english"
) {
  const start =
    mode === "cantonese" ? result.current.startListeningCantonese : result.current.startListeningEnglish;
  await act(async () => {
    await result.current.handleMicPointerDown(start, mode);
  });
  now += 1500;
}

/** Hold the mic long enough to count as a real recording, then release it. */
async function recordAndRelease(
  result: { current: ReturnType<typeof useMicRecording> },
  mode: "cantonese" | "english"
) {
  await startRecordingFor(result, mode);
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
    lastRecordRef.current = openAppendWindow();
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

  test("a practice score is discarded when the conversation resets mid-scoring", async () => {
    const { result, updateMessage, chatEpochRef, messagesRef } = setup();
    // A phrase the user was just shown, so the finished turn gets scored.
    messagesRef.current = [{ id: "u1", sender: "user", text: "good morning", dialectText: "早晨" }];
    mockTranscribeDialect.mockResolvedValue("早晨");
    mockTranslateDialectToEnglish.mockResolvedValue("good morning");
    const scoring = deferred<{ score: number; method: string }>();
    mockScoreDialectAccuracyDetailed.mockReturnValueOnce(scoring.promise);

    await recordAndRelease(result, "cantonese");
    await act(async () => await flush());
    // Scoring is another multi-second round trip; New Chat lands during it.
    chatEpochRef.current += 1;
    await act(async () => {
      scoring.resolve({ score: 0.9, method: "llm" });
      await flush();
    });

    expect(updateMessage).not.toHaveBeenCalled();
  });

  test("a practice score that finishes in the same conversation is attached", async () => {
    const { result, updateMessage, messagesRef } = setup();
    messagesRef.current = [{ id: "u1", sender: "user", text: "good morning", dialectText: "早晨" }];
    mockTranscribeDialect.mockResolvedValue("早晨");
    mockTranslateDialectToEnglish.mockResolvedValue("good morning");

    await recordAndRelease(result, "cantonese");
    await act(async () => await flush());

    expect(updateMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ matchScore: { score: 1, method: "llm" } })
    );
  });
});

describe("useMicRecording dialect switch (CHAT-01)", () => {
  test("switching dialect mid-recording stops the hot mic", async () => {
    const { result, rerender } = setup();
    mockTranscribeDialect.mockResolvedValue("早晨");
    mockTranslateDialectToEnglish.mockResolvedValue("good morning");

    await startRecordingFor(result, "cantonese");
    expect(result.current.isListening).toBe(true);

    // The Dialect mic unmounts with the pack that owns it, so after this
    // switch nothing on screen can release the recording.
    await act(async () => {
      rerender({ languageCode: "nan-TW" });
      await flush();
    });

    expect(mockStopRecording).toHaveBeenCalled();
    expect(result.current.isListening).toBe(false);
    expect(result.current.listeningMode).toBeNull();
  });

  test("switching dialect with no recording in progress stops nothing", async () => {
    const { result, rerender } = setup();

    await act(async () => {
      rerender({ languageCode: "nan-TW" });
      await flush();
    });

    expect(mockStopRecording).not.toHaveBeenCalled();
    expect(result.current.isListening).toBe(false);
  });

  test("re-rendering in the same dialect leaves an active recording alone", async () => {
    const { result, rerender } = setup();

    await startRecordingFor(result, "cantonese");
    await act(async () => {
      rerender({ languageCode: "yue-HK" });
      await flush();
    });

    expect(mockStopRecording).not.toHaveBeenCalled();
    expect(result.current.isListening).toBe(true);
  });

  test("a switch while the permission prompt is still up never arms the mic", async () => {
    const { result, rerender } = setup();
    // Chromium's permission prompt does not block the page, so the user can
    // switch dialect while it is still up and answer it afterwards.
    const permission = deferred<void>();
    mockStartRecording.mockReturnValueOnce(permission.promise);

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.handleMicPointerDown(result.current.startListeningCantonese, "cantonese");
    });
    expect(result.current.isListening).toBe(false); // nothing is recording yet

    await act(async () => {
      rerender({ languageCode: "nan-TW" });
      await flush();
    });
    await act(async () => {
      permission.resolve();
      await pending;
      await flush();
    });

    // Arming here would hand the recording to a pack whose mic — the only
    // stop control — is no longer on screen.
    expect(result.current.isListening).toBe(false);
    expect(result.current.listeningMode).toBeNull();
    expect(mockStopRecording).toHaveBeenCalled();
  });
});

describe("useMicRecording append merge (CHAT-06)", () => {
  test("an append keeps the tags and bookmark added while the turn was in flight", async () => {
    const { result, updatePhrase, updateMessage, lastRecordRef, phrasesRef } = setup();
    lastRecordRef.current = openAppendWindow();
    mockTranscribeDialect.mockResolvedValue("食咗飯未");
    const translation = deferred<string>();
    mockTranslateDialectToEnglish.mockReturnValue(translation.promise);

    await recordAndRelease(result, "cantonese");
    // The user bookmarks and tags the bubble while the translation is in
    // flight — the write below must read the library as it is now, not as it
    // was when the recording started.
    phrasesRef.current = [BOOKMARKED_PHRASE];
    await act(async () => {
      translation.resolve("good morning, have you eaten");
      await flush();
    });

    expect(updatePhrase).toHaveBeenCalledWith({
      ...BOOKMARKED_PHRASE,
      original: "good morning, have you eaten",
      dialect: "早晨 食咗飯未",
      audioDataUrl: "data:audio/webm;base64,BBB",
      audioDataUrls: ["data:audio/webm;base64,BBB", "data:audio/webm;base64,AAA"],
    });
    expect(updateMessage).toHaveBeenCalledWith("m1", {
      text: "早晨 食咗飯未",
      englishTranslation: "good morning, have you eaten",
      audioDataUrls: ["data:audio/webm;base64,BBB", "data:audio/webm;base64,AAA"],
    });
  });

  // No phrase can currently leave the library, so this only pins the shape the
  // pre-merge code wrote. LibraryProvider.updatePhrase ignores an unknown id,
  // and did before this change too.
  test("an append with no phrase to merge over falls back to the whole-turn shape", async () => {
    const { result, updatePhrase, lastRecordRef, phrasesRef } = setup();
    lastRecordRef.current = openAppendWindow();
    phrasesRef.current = [];
    mockTranscribeDialect.mockResolvedValue("食咗飯未");
    mockTranslateDialectToEnglish.mockResolvedValue("good morning, have you eaten");

    await recordAndRelease(result, "cantonese");
    await act(async () => await flush());

    expect(updatePhrase).toHaveBeenCalledWith({
      id: "m1",
      original: "good morning, have you eaten",
      dialect: "早晨 食咗飯未",
      pronunciation: "",
      isBookmarked: false,
      context: "",
      audioDataUrl: "data:audio/webm;base64,BBB",
      audioDataUrls: ["data:audio/webm;base64,BBB", "data:audio/webm;base64,AAA"],
      languageCode: "yue-HK",
    });
  });
});

describe("useMicRecording English mic permission (CHAT-10)", () => {
  test("a denied mic leaves the visible chips alone", async () => {
    const { result, setLatestSuggestions } = setup();
    mockStartRecording.mockRejectedValueOnce(new Error("denied"));

    await startRecordingFor(result, "english");

    expect(setLatestSuggestions).not.toHaveBeenCalled();
    expect(result.current.isListening).toBe(false);
  });

  test("a granted mic clears the chips so they cannot be tapped mid-recording", async () => {
    const { result, setLatestSuggestions } = setup();

    await startRecordingFor(result, "english");

    expect(setLatestSuggestions).toHaveBeenCalledWith([]);
    expect(result.current.listeningMode).toBe("english");
  });
});
