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

/** A promise plus its resolver/rejecter, so a test can hold a request mid-flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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
  mode: "cantonese" | "english",
  pointerId = 1
) {
  const start =
    mode === "cantonese" ? result.current.startListeningCantonese : result.current.startListeningEnglish;
  await act(async () => {
    await result.current.handleMicPointerDown(start, mode, pointerId);
  });
  now += 1500;
}

/** Hold the mic long enough to count as a real recording, then release it. */
async function recordAndRelease(
  result: { current: ReturnType<typeof useMicRecording> },
  mode: "cantonese" | "english",
  pointerId = 1
) {
  await startRecordingFor(result, mode, pointerId);
  await act(async () => {
    result.current.handleMicPointerUp(mode, pointerId);
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
      pending = result.current.handleMicPointerDown(result.current.startListeningCantonese, "cantonese", 1);
    });
    expect(result.current.isListening).toBe(false); // nothing is recording yet

    await act(async () => {
      rerender({ languageCode: "nan-TW" });
      await flush();
    });

    // The rerender's own stopListening (the too-short-recording path, since
    // no time has passed) already called stopRecording once. Clear that call
    // so the assertion below pins the orphaned-stream discard specifically —
    // otherwise it would trivially pass on this earlier, unrelated call.
    mockStopRecording.mockClear();

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

  // Folded item C — startListening's catch block nulled recordingModeRef /
  // recordingStartRef unconditionally. A permission prompt can be answered
  // long after the user let go of it, so if a different mic arm had already
  // taken ownership of those refs by the time a stale prompt came back
  // denied, the denial wiped that other arm's ownership out from under it.
  test("a late permission denial for one recording arm does not clear a different arm's ownership", async () => {
    const { result } = setup();
    const deniedPermission = deferred<void>();
    mockStartRecording.mockReturnValueOnce(deniedPermission.promise);

    let cantonesePending!: Promise<void>;
    act(() => {
      cantonesePending = result.current.handleMicPointerDown(
        result.current.startListeningCantonese,
        "cantonese",
        1
      );
    });

    // The user lets go before the browser's permission prompt answers,
    // releasing cantonese's ownership without settling its promise.
    await act(async () => {
      result.current.handleMicPointerLeave("cantonese", 1);
      await flush();
    });

    // A new recording starts in a different mode and takes over ownership.
    const grantedPermission = deferred<void>();
    mockStartRecording.mockReturnValueOnce(grantedPermission.promise);
    let englishPending!: Promise<void>;
    act(() => {
      englishPending = result.current.handleMicPointerDown(
        result.current.startListeningEnglish,
        "english",
        2
      );
    });
    await act(async () => {
      grantedPermission.resolve();
      await englishPending;
      await flush();
    });
    expect(result.current.listeningMode).toBe("english");

    // The stale cantonese prompt finally comes back denied.
    await act(async () => {
      deniedPermission.reject(new Error("denied"));
      await cantonesePending;
      await flush();
    });

    // English's ownership must survive the stale rejection: pointer-up on it
    // still registers instead of being silently ignored.
    act(() => {
      result.current.handleMicPointerUp("english", 2);
    });
    expect(result.current.isTapMode).toBe(true);
  });

  // Reviewer follow-up on folded item C — mode-equality alone cannot tell a
  // released-then-re-armed SAME-mode attempt apart from the stale one it
  // replaced (both see recordingModeRef.current === mode at the time the
  // stale one settles). A monotonic per-attempt token closes this, since it
  // identifies the specific call rather than just the mode string.
  test("a late permission denial for a released same-mode attempt does not corrupt the one that replaced it", async () => {
    const { result } = setup();
    const deniedPermission = deferred<void>();
    mockStartRecording.mockReturnValueOnce(deniedPermission.promise);

    let firstPending!: Promise<void>;
    act(() => {
      firstPending = result.current.handleMicPointerDown(
        result.current.startListeningCantonese,
        "cantonese",
        1
      );
    });

    // Released before the first prompt answers — same release mechanism as
    // the cross-mode test above.
    await act(async () => {
      result.current.handleMicPointerLeave("cantonese", 1);
      await flush();
    });

    // Pressed again in the SAME mode — ownership was released, so the
    // reentry guard sees this as a brand new attempt. On touch a fresh
    // contact gets a fresh pointer id.
    const grantedPermission = deferred<void>();
    mockStartRecording.mockReturnValueOnce(grantedPermission.promise);
    let secondPending!: Promise<void>;
    act(() => {
      secondPending = result.current.handleMicPointerDown(
        result.current.startListeningCantonese,
        "cantonese",
        2
      );
    });

    // The stale first prompt finally comes back denied. recordingModeRef
    // still reads "cantonese" here — the second attempt set it too — so a
    // mode-only ownership check cannot distinguish the two calls.
    await act(async () => {
      deniedPermission.reject(new Error("denied"));
      await firstPending;
      await flush();
    });

    // The second attempt's prompt is then granted — it must still arm.
    await act(async () => {
      grantedPermission.resolve();
      await secondPending;
      await flush();
    });

    expect(result.current.listeningMode).toBe("cantonese");
    expect(result.current.isListening).toBe(true);
  });

  // Coordinator round-2 IMPORTANT — the same-mode late-GRANT case. When a
  // released attempt's prompt is finally granted, a newer attempt may already
  // own the mode, and the discard path must not reach for the shared recorder
  // on its behalf: tearing it down would leave attempt 2's UI "listening" with
  // nothing recording, and its pointer-up would hit audio.ts's "Recording
  // already stopped" rejection. The fix is that recordingModeRef.current !==
  // null means someone else owns the recording now — discarding only touches
  // recorder state when nothing else does.
  //
  // audio.ts has since been made to serialize overlapping starts, so it no
  // longer hands ownership to whichever getUserMedia() resolves last and only
  // one recorder is ever live. This test still pins the hook's own contract:
  // it mocks useAudioRecorder outright, so it asserts what THIS hook may do in
  // the discard path regardless of how audio.ts arbitrates underneath.
  test("a late permission GRANT for a released same-mode attempt does not tear down the one that replaced it", async () => {
    const { result } = setup();
    const firstPermission = deferred<void>();
    mockStartRecording.mockReturnValueOnce(firstPermission.promise);

    let firstPending!: Promise<void>;
    act(() => {
      firstPending = result.current.handleMicPointerDown(
        result.current.startListeningCantonese,
        "cantonese",
        1
      );
    });

    // Released before the first prompt answers.
    await act(async () => {
      result.current.handleMicPointerLeave("cantonese", 1);
      await flush();
    });

    // Attempt 2, same mode, arms first (resolves immediately).
    mockStartRecording.mockResolvedValueOnce(undefined);
    let secondPending!: Promise<void>;
    act(() => {
      secondPending = result.current.handleMicPointerDown(
        result.current.startListeningCantonese,
        "cantonese",
        2
      );
    });
    await act(async () => {
      await secondPending;
      await flush();
    });
    expect(result.current.listeningMode).toBe("cantonese");

    // Isolate the assertion below to what happens from here — an earlier
    // stopRecording() (the release's own "too short" cleanup) already fired.
    mockStopRecording.mockClear();

    // Attempt 1's stale prompt is finally granted — after attempt 2 already
    // owns the (single, shared) recorder.
    await act(async () => {
      firstPermission.resolve();
      await firstPending;
      await flush();
    });

    // The discard must not tear down the recorder attempt 2 owns.
    expect(mockStopRecording).not.toHaveBeenCalled();
    expect(result.current.listeningMode).toBe("cantonese");

    // Attempt 2's own lifecycle still completes the turn normally.
    now += 1500;
    await act(async () => {
      result.current.handleMicPointerUp("cantonese", 2);
      await flush();
    });
    expect(mockStopRecording).toHaveBeenCalledTimes(1);
  });
});

describe("useMicRecording pending-prompt slide-off", () => {
  // The exam mic needed pointer capture to close this hole; the chat mic does
  // not have it. Its leave handler keys on recordingModeRef — the claim set
  // synchronously on press — rather than on post-resolution listening state,
  // so sliding off while the prompt is still up releases the claim, and the
  // resolved start's ownership re-check stands the orphaned recorder down.
  test("sliding off the mic while the permission prompt is up never arms the mic", async () => {
    const { result } = setup();
    const permission = deferred<void>();
    mockStartRecording.mockReturnValueOnce(permission.promise);

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.handleMicPointerDown(result.current.startListeningCantonese, "cantonese", 1);
    });
    expect(result.current.isListening).toBe(false); // nothing is recording yet

    await act(async () => {
      result.current.handleMicPointerLeave("cantonese", 1);
      await flush();
    });

    // The slide-off's own stopListening (the too-short path) already called
    // stopRecording once; clear it so the assertion below pins the discard of
    // the recorder the granted prompt hands back specifically.
    mockStopRecording.mockClear();

    await act(async () => {
      permission.resolve();
      await pending;
      await flush();
    });

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

// Mirrors the exam mic's pointer-ownership fix (ExamView's ownerPointerIdRef):
// the pointerdown that starts a gesture claims ownership, and up/leave from
// any OTHER pointer are ignored — a palm edge or a mouse gliding over the
// button must not end a hold it never started. Tap-to-stop stays any-pointer
// (on touch, every tap is a new pointer id), and pointerdown is never
// hard-gated on the id alone: a press by the same id as a stale owner falls
// through to the stop path and reclaims the mic, so a stale owner can never
// dead-lock the button.
describe("useMicRecording pointer ownership", () => {
  test("a different pointer's leave during an armed hold does not stop the recording", async () => {
    const { result } = setup();
    mockTranscribeDialect.mockResolvedValue("早晨");
    mockTranslateDialectToEnglish.mockResolvedValue("good morning");

    await startRecordingFor(result, "cantonese", 1);
    // A mouse glides across the button while the finger is still holding it.
    await act(async () => {
      result.current.handleMicPointerLeave("cantonese", 2);
      await flush();
    });

    expect(result.current.isListening).toBe(true);
    expect(mockStopRecording).not.toHaveBeenCalled();

    // The owning finger's release still ends the hold normally.
    await act(async () => {
      result.current.handleMicPointerUp("cantonese", 1);
      await flush();
    });
    expect(mockStopRecording).toHaveBeenCalledTimes(1);
    expect(result.current.isListening).toBe(false);
  });

  test("a second pointer's press during an armed hold does not stop or restart the recording", async () => {
    const { result } = setup();
    mockTranscribeDialect.mockResolvedValue("早晨");
    mockTranslateDialectToEnglish.mockResolvedValue("good morning");

    await startRecordingFor(result, "cantonese", 1);
    // A palm edge or second finger presses the button mid-take.
    await act(async () => {
      await result.current.handleMicPointerDown(result.current.startListeningCantonese, "cantonese", 2);
      await flush();
    });

    expect(result.current.isListening).toBe(true);
    expect(mockStopRecording).not.toHaveBeenCalled();
    expect(mockStartRecording).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.handleMicPointerUp("cantonese", 1);
      await flush();
    });
    expect(mockStopRecording).toHaveBeenCalledTimes(1);
  });

  test("a second pointer's press while a start is pending does not abort the pending start", async () => {
    const { result } = setup();
    const permission = deferred<void>();
    mockStartRecording.mockReturnValueOnce(permission.promise);

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.handleMicPointerDown(result.current.startListeningCantonese, "cantonese", 1);
    });

    // While the permission prompt is up, a palm edge lands on the other mic
    // (it is not disabled yet — nothing is listening).
    await act(async () => {
      await result.current.handleMicPointerDown(result.current.startListeningEnglish, "english", 2);
      await flush();
    });
    expect(mockStartRecording).toHaveBeenCalledTimes(1); // the palm press never armed anything

    await act(async () => {
      permission.resolve();
      await pending;
      await flush();
    });

    // The owner's pending start survives the incidental press and arms.
    expect(result.current.isListening).toBe(true);
    expect(result.current.listeningMode).toBe("cantonese");
  });

  test("a different pointer's release during an armed hold does not end it or arm tap mode", async () => {
    const { result } = setup();
    mockTranscribeDialect.mockResolvedValue("早晨");
    mockTranslateDialectToEnglish.mockResolvedValue("good morning");

    await startRecordingFor(result, "cantonese", 1);
    // The palm edge whose press was ignored lifts over the button.
    act(() => {
      result.current.handleMicPointerUp("cantonese", 2);
    });

    expect(result.current.isListening).toBe(true);
    expect(result.current.isTapMode).toBe(false);
    expect(mockStopRecording).not.toHaveBeenCalled();

    await act(async () => {
      result.current.handleMicPointerUp("cantonese", 1);
      await flush();
    });
    expect(mockStopRecording).toHaveBeenCalledTimes(1);
  });

  test("a tap recording is stopped by a press from any pointer", async () => {
    const { result } = setup();
    mockTranscribeDialect.mockResolvedValue("早晨");
    mockTranslateDialectToEnglish.mockResolvedValue("good morning");

    // Quick press-release arms tap mode; the recording keeps running.
    await act(async () => {
      await result.current.handleMicPointerDown(result.current.startListeningCantonese, "cantonese", 1);
    });
    now += 300;
    act(() => {
      result.current.handleMicPointerUp("cantonese", 1);
    });
    expect(result.current.isTapMode).toBe(true);

    // On touch the stopping tap is a brand new pointer id — it must still stop.
    now += 1200;
    await act(async () => {
      await result.current.handleMicPointerDown(result.current.startListeningCantonese, "cantonese", 7);
      await flush();
    });

    expect(result.current.isListening).toBe(false);
    expect(mockStopRecording).toHaveBeenCalledTimes(1);
  });

  test("a stray release after a tap is armed does not stop the tap recording", async () => {
    const { result } = setup();
    mockTranscribeDialect.mockResolvedValue("早晨");
    mockTranslateDialectToEnglish.mockResolvedValue("good morning");

    await act(async () => {
      await result.current.handleMicPointerDown(result.current.startListeningCantonese, "cantonese", 1);
    });
    now += 300;
    act(() => {
      result.current.handleMicPointerUp("cantonese", 1);
    });
    expect(result.current.isTapMode).toBe(true);
    now += 1200;

    // A pointer that pressed elsewhere is dragged over the button and lifts
    // there; a replayed release of the original id is equally stray — the
    // arming gesture already ended.
    act(() => {
      result.current.handleMicPointerUp("cantonese", 2);
    });
    act(() => {
      result.current.handleMicPointerUp("cantonese", 1);
    });

    expect(result.current.isListening).toBe(true);
    expect(mockStopRecording).not.toHaveBeenCalled();
  });

  test("a press with the stale owner's id reclaims a hold whose release was lost", async () => {
    const { result } = setup();
    mockTranscribeDialect.mockResolvedValue("早晨");
    mockTranslateDialectToEnglish.mockResolvedValue("good morning");

    await startRecordingFor(result, "cantonese", 1);
    // The release never arrived (a mouse lifted off-page without crossing the
    // button's boundary); the same pointer presses again. It must not find
    // the button inert — the press falls through and stops the orphaned hold.
    await act(async () => {
      await result.current.handleMicPointerDown(result.current.startListeningCantonese, "cantonese", 1);
      await flush();
    });

    expect(result.current.isListening).toBe(false);
    expect(mockStopRecording).toHaveBeenCalledTimes(1);
  });
});

// The chat mics were operated only through pointer events, so a keyboard user
// who tabbed to one and pressed Enter/Space could not record. The keyboard
// path is a toggle with tap semantics: one activation arms the mic exactly
// like a sub-second tap (recording continues after the handler returns), the
// next stops it and processes the turn.
describe("useMicRecording keyboard toggle", () => {
  test("a keyboard toggle arms the mic in tap mode and a second toggle stops and processes the turn", async () => {
    const { result, addMessage } = setup();
    mockTranscribeDialect.mockResolvedValue("早晨");
    mockTranslateDialectToEnglish.mockResolvedValue("good morning");

    await act(async () => {
      await result.current.handleMicKeyboardToggle(result.current.startListeningCantonese, "cantonese");
    });
    expect(result.current.isListening).toBe(true);
    expect(result.current.isTapMode).toBe(true);

    now += 1500;
    await act(async () => {
      await result.current.handleMicKeyboardToggle(result.current.startListeningCantonese, "cantonese");
      await flush();
    });

    expect(result.current.isListening).toBe(false);
    expect(mockStopRecording).toHaveBeenCalled();
    expect(addMessage).toHaveBeenCalledWith(expect.objectContaining({ text: "早晨", sender: "bot" }));
  });

  test("a mouse passing over the mic does not end a keyboard-armed recording", async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.handleMicKeyboardToggle(result.current.startListeningCantonese, "cantonese");
    });
    expect(result.current.isListening).toBe(true);

    await act(async () => {
      result.current.handleMicPointerLeave("cantonese", 2);
      await flush();
    });

    expect(result.current.isListening).toBe(true);
    expect(mockStopRecording).not.toHaveBeenCalled();
  });

  test("a keyboard toggle during a slow permission prompt releases the claim so the mic never arms", async () => {
    const { result } = setup();
    const permission = deferred<void>();
    mockStartRecording.mockReturnValueOnce(permission.promise);

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.handleMicKeyboardToggle(result.current.startListeningCantonese, "cantonese");
    });
    expect(result.current.isListening).toBe(false); // nothing is recording yet

    // The prompt is still up and the user toggles again to cancel.
    await act(async () => {
      result.current.handleMicKeyboardToggle(result.current.startListeningCantonese, "cantonese");
      await flush();
    });

    // The cancel's own stopListening (the too-short path) already called
    // stopRecording once; clear it so the assertion below pins the discard of
    // the recorder the granted prompt hands back specifically.
    mockStopRecording.mockClear();

    await act(async () => {
      permission.resolve();
      await pending;
      await flush();
    });

    expect(result.current.isListening).toBe(false);
    expect(result.current.listeningMode).toBeNull();
    expect(mockStopRecording).toHaveBeenCalled();
  });
});
