import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { toast } from "sonner";
import type { Message, Phrase, Tag } from "../../../types";
import { usePhraseSelection } from "./usePhraseSelection";

// CHAT-08 — saving a selected phrase runs for as long as its audio takes
// (replaying the captured clips, or a fresh TTS round trip for edited text)
// while the sheet's Save button stayed live. A second tap saved the same
// phrase again under a new id. The handler now refuses re-entry and the sheet
// disables the button while a save is in flight.

const mockPlayDataUrl = vi.fn<(url: string) => Promise<void>>();
const mockSpeakTextAndCapture = vi.fn();
let idCounter = 0;

vi.mock("../../../hooks/audio", () => ({
  playDataUrl: (url: string) => mockPlayDataUrl(url),
}));

vi.mock("../../../hooks/useGoogleTTS", () => ({
  speakTextAndCapture: (...args: unknown[]) => mockSpeakTextAndCapture(...args),
}));

vi.mock("../../../utils/id", () => ({
  newId: () => `phrase-${++idCounter}`,
}));

const mockToastInfo = vi.fn();

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: (...args: unknown[]) => mockToastInfo(...args) },
}));

// The long-press plumbing is a pointer/timer concern of its own; this file
// only needs the sheet opened, so the callback is captured directly.
let openSheet: (msg: Message, preText: string) => void = () => {};

vi.mock("./useBubbleLongPress", () => ({
  useBubbleLongPress: (onSelect: (msg: Message, preText: string) => void) => {
    openSheet = onSelect;
    return {
      handleBubblePointerDown: vi.fn(),
      cancelBubbleLongPress: vi.fn(),
      handleBubblePointerMove: vi.fn(),
    };
  },
}));

/** A promise plus its resolver, so a test can hold a save mid-flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const BOT_MESSAGE: Message = {
  id: "m1",
  sender: "bot",
  text: "早晨",
  englishTranslation: "good morning",
  audioDataUrls: ["data:audio/webm;base64,AAA"],
};

const OTHER_BOT_MESSAGE: Message = {
  id: "m2",
  sender: "bot",
  text: "食咗飯未",
  englishTranslation: "have you eaten",
  audioDataUrls: ["data:audio/webm;base64,BBB"],
};

const NEW_TAG: Tag = { id: "pt1", name: "Greetings", type: "phrase", createdAt: "2026-01-01T00:00:00.000Z" };

function setup() {
  const addPhrase = vi.fn<(phrase: Phrase) => void>();
  const createTag = vi.fn(() => NEW_TAG);
  // A plain ref, not state: usePhraseSelection reads it live inside the
  // long-press callback, which can fire up to 500ms after pointer-down —
  // tests mutate `.current` directly to simulate the value changing during
  // that window, the same way ChatPage keeps it in sync every render.
  const isTranscriptReviewOpenRef = { current: false };
  const { result } = renderHook(() =>
    usePhraseSelection({
      addPhrase,
      activeLanguageCode: "yue-HK",
      userProfile: null,
      createTag,
      isTranscriptReviewOpenRef,
    })
  );
  return { result, addPhrase, createTag, isTranscriptReviewOpenRef };
}

/** Open the sheet on the bot bubble with the given (possibly edited) selection. */
function openWith(result: { current: ReturnType<typeof usePhraseSelection> }, text = "早晨") {
  act(() => openSheet(BOT_MESSAGE, "早晨"));
  act(() => result.current.setPhraseSelectionText(text));
}

beforeEach(() => {
  vi.clearAllMocks();
  idCounter = 0;
  mockPlayDataUrl.mockImplementation(() => Promise.resolve());
  mockSpeakTextAndCapture.mockResolvedValue({
    audioDataUrl: "data:audio/mp3;base64,BBB",
    play: () => Promise.resolve(),
  });
});

afterEach(cleanup);

describe("usePhraseSelection double-save guard (CHAT-08)", () => {
  test("a second Save tap during an unedited save does not save twice", async () => {
    const { result, addPhrase } = setup();
    openWith(result);
    const replay = deferred<void>();
    mockPlayDataUrl.mockReturnValue(replay.promise);

    act(() => {
      void result.current.handleSaveSelectedPhrase();
      void result.current.handleSaveSelectedPhrase();
    });
    await act(async () => {
      replay.resolve();
      await flush();
    });

    expect(addPhrase).toHaveBeenCalledTimes(1);
  });

  test("a second Save tap during an edited save does not save twice", async () => {
    const { result, addPhrase } = setup();
    openWith(result, "早晨啊");
    const tts = deferred<{ audioDataUrl: string; play: () => Promise<void> }>();
    mockSpeakTextAndCapture.mockReturnValue(tts.promise);

    act(() => {
      void result.current.handleSaveSelectedPhrase();
      void result.current.handleSaveSelectedPhrase();
    });
    await act(async () => {
      tts.resolve({ audioDataUrl: "data:audio/mp3;base64,BBB", play: () => Promise.resolve() });
      await flush();
    });

    expect(mockSpeakTextAndCapture).toHaveBeenCalledTimes(1);
    expect(addPhrase).toHaveBeenCalledTimes(1);
  });

  test("isSavingPhrase is set while the save runs and cleared when it settles", async () => {
    const { result } = setup();
    openWith(result);
    const replay = deferred<void>();
    mockPlayDataUrl.mockReturnValue(replay.promise);

    act(() => void result.current.handleSaveSelectedPhrase());
    expect(result.current.isSavingPhrase).toBe(true);

    await act(async () => {
      replay.resolve();
      await flush();
    });

    expect(result.current.isSavingPhrase).toBe(false);
  });

  test("a failed save clears isSavingPhrase so the sheet stays usable", async () => {
    const { result } = setup();
    openWith(result, "早晨啊");
    mockSpeakTextAndCapture.mockRejectedValueOnce(new Error("tts down"));

    await act(async () => {
      await result.current.handleSaveSelectedPhrase();
    });

    expect(result.current.isSavingPhrase).toBe(false);
  });

  test("a long press on another bubble during a save cannot take over the sheet", async () => {
    const { result } = setup();
    openWith(result);
    const replay = deferred<void>();
    mockPlayDataUrl.mockReturnValue(replay.promise);

    act(() => void result.current.handleSaveSelectedPhrase());
    act(() => openSheet(OTHER_BOT_MESSAGE, "食咗飯未"));

    // The save clears the selection when it settles, so a second bubble
    // adopted mid-save would have its sheet closed and its edits dropped
    // without the user ever confirming it.
    expect(result.current.phraseSelectionMsg).toBe(BOT_MESSAGE);
    expect(result.current.phraseSelectionText).toBe("早晨");

    await act(async () => {
      replay.resolve();
      await flush();
    });

    expect(result.current.phraseSelectionMsg).toBeNull();
  });

  test("a later save still works once the first has finished", async () => {
    const { result, addPhrase } = setup();
    openWith(result);
    await act(async () => {
      await result.current.handleSaveSelectedPhrase();
    });

    openWith(result);
    await act(async () => {
      await result.current.handleSaveSelectedPhrase();
    });

    expect(addPhrase).toHaveBeenCalledTimes(2);
  });
});

// CHAT-11 — a half-typed new tag sitting in the "New" input was silently
// dropped if the user tapped Save instead of Enter/the tag's own check
// button. It is now committed at save time exactly like
// useSessionSave.confirmSave does: trim, createTag, append the id.
describe("usePhraseSelection tag commit at save time (CHAT-11)", () => {
  test("a half-typed new tag is committed and attached to the saved phrase", async () => {
    const { result, addPhrase, createTag } = setup();
    openWith(result);
    act(() => result.current.setIsCreatingPhraseTag(true));
    act(() => result.current.setNewTagInput("Greetings"));

    await act(async () => {
      await result.current.handleSaveSelectedPhrase();
    });

    expect(createTag).toHaveBeenCalledWith("Greetings", "phrase");
    expect(addPhrase).toHaveBeenCalledWith(expect.objectContaining({ tags: ["pt1"] }));
  });

  test("the tag-input state is cleared once the new tag is committed", async () => {
    const { result } = setup();
    openWith(result);
    act(() => result.current.setIsCreatingPhraseTag(true));
    act(() => result.current.setNewTagInput("Greetings"));

    await act(async () => {
      await result.current.handleSaveSelectedPhrase();
    });

    expect(result.current.isCreatingPhraseTag).toBe(false);
    expect(result.current.newTagInput).toBe("");
  });

  test("a blank new-tag input is not committed as a tag", async () => {
    const { result, addPhrase, createTag } = setup();
    openWith(result);
    act(() => result.current.setIsCreatingPhraseTag(true));
    act(() => result.current.setNewTagInput("   "));

    await act(async () => {
      await result.current.handleSaveSelectedPhrase();
    });

    expect(createTag).not.toHaveBeenCalled();
    expect(addPhrase).toHaveBeenCalledWith(expect.objectContaining({ tags: [] }));
  });

  test("an already-selected tag is preserved alongside a newly committed one", async () => {
    const { result, addPhrase } = setup();
    openWith(result);
    act(() => result.current.setPhraseTagSelection(["existing-tag"]));
    act(() => result.current.setIsCreatingPhraseTag(true));
    act(() => result.current.setNewTagInput("Greetings"));

    await act(async () => {
      await result.current.handleSaveSelectedPhrase();
    });

    expect(addPhrase).toHaveBeenCalledWith(expect.objectContaining({ tags: ["existing-tag", "pt1"] }));
  });

  // createTag dedupes by name+type and returns the *existing* tag when the
  // typed name already matches one already selected — e.g. the user tapped
  // the "Greetings" chip, then also typed "Greetings" into "New" and hit
  // Save. Appending unconditionally would duplicate that id in phrase.tags.
  test("a new-tag name that matches an already-selected tag does not duplicate its id", async () => {
    const { result, addPhrase, createTag } = setup();
    createTag.mockReturnValue({ ...NEW_TAG, id: "existing-tag" });
    openWith(result);
    act(() => result.current.setPhraseTagSelection(["existing-tag"]));
    act(() => result.current.setIsCreatingPhraseTag(true));
    act(() => result.current.setNewTagInput("Greetings"));

    await act(async () => {
      await result.current.handleSaveSelectedPhrase();
    });

    expect(addPhrase).toHaveBeenCalledWith(expect.objectContaining({ tags: ["existing-tag"] }));
  });

  test("not creating a tag leaves the existing selection untouched", async () => {
    const { result, addPhrase, createTag } = setup();
    openWith(result);
    act(() => result.current.setPhraseTagSelection(["existing-tag"]));

    await act(async () => {
      await result.current.handleSaveSelectedPhrase();
    });

    expect(createTag).not.toHaveBeenCalled();
    expect(addPhrase).toHaveBeenCalledWith(expect.objectContaining({ tags: ["existing-tag"] }));
  });
});

// Coordinator round-2 IMPORTANT #1 — the transcript-review guard used to
// live in ChatPage, checked at pointer-down: it toasted on every bubble
// touch while the overlay was open, including scroll drags and taps that
// were never going to open anything, and left a window where pendingEnglish
// turning true up to 500ms later (after that check already passed) still
// let the sheet open behind the overlay. It is now checked here instead,
// inside the long-press callback — which useBubbleLongPress already gates
// on a genuinely completed long-press with non-empty preText, i.e. only
// fires at the moment a selection would actually open — so a mid-scroll or
// short-tap pointer-down never reaches this check at all, and no toast.
describe("usePhraseSelection transcript-review guard (coordinator round-2 IMPORTANT #1)", () => {
  test("a completed long-press while the transcript review is open does not open the sheet", () => {
    const { result, isTranscriptReviewOpenRef } = setup();
    isTranscriptReviewOpenRef.current = true;

    act(() => openSheet(BOT_MESSAGE, "早晨"));

    expect(result.current.phraseSelectionMsg).toBeNull();
    expect(mockToastInfo).toHaveBeenCalledWith("Finish reviewing your transcript first.");
  });

  test("a completed long-press once the transcript review has cleared opens normally", () => {
    const { result, isTranscriptReviewOpenRef } = setup();
    isTranscriptReviewOpenRef.current = false;

    act(() => openSheet(BOT_MESSAGE, "早晨"));

    expect(result.current.phraseSelectionMsg).toBe(BOT_MESSAGE);
    expect(mockToastInfo).not.toHaveBeenCalled();
  });
});

// Coordinator round-2 IMPORTANT #3 — CHAT-11's save-time tag commit turned a
// silent DROP into a silent MIS-ATTACH: the sheet has no backdrop, so
// bubbles stay live, and phraseTagSelection/newTagInput/isCreatingPhraseTag
// used to survive a long-press on a DIFFERENT bubble. A half-typed (or
// already-selected) tag left over from bubble A's abandoned session would
// then commit onto — or attach to — bubble B's save. Mirrors CHAT-12's
// openSaveDialog: a new long-press selection now resets all three, the same
// way useSessionSave resets its own tag-session fields on every (re)open
// rather than only on an explicit Cancel.
describe("usePhraseSelection tag residue reset on selection switch (coordinator round-2 IMPORTANT #3)", () => {
  test("a long-press on a different bubble clears a half-typed tag left over from the previous selection", async () => {
    const { result, addPhrase, createTag } = setup();
    openWith(result); // opens on BOT_MESSAGE (A)
    act(() => result.current.setIsCreatingPhraseTag(true));
    act(() => result.current.setNewTagInput("A's tag"));

    // Long-press a DIFFERENT bubble (B) without confirming A's tag or saving.
    act(() => openSheet(OTHER_BOT_MESSAGE, "食咗飯未"));

    expect(result.current.phraseSelectionMsg).toBe(OTHER_BOT_MESSAGE);
    expect(result.current.isCreatingPhraseTag).toBe(false);
    expect(result.current.newTagInput).toBe("");

    await act(async () => {
      await result.current.handleSaveSelectedPhrase();
    });

    expect(createTag).not.toHaveBeenCalled();
    expect(addPhrase).toHaveBeenCalledWith(expect.objectContaining({ tags: [] }));
  });

  test("a long-press on a different bubble also clears an already-selected tag, not just a half-typed one", async () => {
    const { result, addPhrase } = setup();
    openWith(result);
    act(() => result.current.setPhraseTagSelection(["a-only-tag"]));

    act(() => openSheet(OTHER_BOT_MESSAGE, "食咗飯未"));

    expect(result.current.phraseTagSelection).toEqual([]);

    await act(async () => {
      await result.current.handleSaveSelectedPhrase();
    });

    expect(addPhrase).toHaveBeenCalledWith(expect.objectContaining({ tags: [] }));
  });

  test("re-opening the same bubble also resets tag state — the reset does not require an explicit Cancel", () => {
    const { result } = setup();
    openWith(result);
    act(() => result.current.setNewTagInput("half-typed"));
    act(() => result.current.setIsCreatingPhraseTag(true));

    act(() => openSheet(BOT_MESSAGE, "早晨"));

    expect(result.current.isCreatingPhraseTag).toBe(false);
    expect(result.current.newTagInput).toBe("");
  });
});

// Final whole-branch review (MINOR) — the selection was cleared
// unconditionally after the try/catch, so a FAILED save closed the sheet and
// threw away the user's edited text behind the error toast: the one state
// worth keeping was the one the failure destroyed. The clears now run only
// when the save actually succeeded.
describe("usePhraseSelection failed-save retention", () => {
  test("a failed save keeps the sheet open with the edited text intact", async () => {
    const { result } = setup();
    openWith(result, "早晨啊"); // edited → the TTS path, which is what rejects
    mockSpeakTextAndCapture.mockRejectedValueOnce(new Error("tts down"));

    await act(async () => {
      await result.current.handleSaveSelectedPhrase();
    });

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Failed to save phrase.");
    expect(result.current.phraseSelectionMsg).toBe(BOT_MESSAGE);
    expect(result.current.phraseSelectionText).toBe("早晨啊");
  });

  test("a failed save keeps the chosen tags so a retry still carries them", async () => {
    const { result } = setup();
    openWith(result, "早晨啊");
    act(() => result.current.setPhraseTagSelection(["existing-tag"]));
    mockSpeakTextAndCapture.mockRejectedValueOnce(new Error("tts down"));

    await act(async () => {
      await result.current.handleSaveSelectedPhrase();
    });

    expect(result.current.phraseTagSelection).toEqual(["existing-tag"]);
  });

  test("retrying after a failed save saves the edited text the sheet kept", async () => {
    const { result, addPhrase } = setup();
    openWith(result, "早晨啊");
    mockSpeakTextAndCapture.mockRejectedValueOnce(new Error("tts down"));
    await act(async () => {
      await result.current.handleSaveSelectedPhrase();
    });
    expect(addPhrase).not.toHaveBeenCalled();

    // Act — the user taps Save again on the sheet that stayed open
    await act(async () => {
      await result.current.handleSaveSelectedPhrase();
    });

    expect(addPhrase).toHaveBeenCalledWith(expect.objectContaining({ dialect: "早晨啊" }));
  });

  // The boundary the success flag draws: the phrase reaching the library, not
  // the handler running to the end. Audio is replayed AFTER addPhrase, so a
  // clip that fails to play has still saved the phrase — reopening the sheet
  // there would invite a retry that saves it twice.
  test("audio failing after the phrase was added still closes the sheet", async () => {
    const { result, addPhrase } = setup();
    openWith(result, "早晨啊");
    mockSpeakTextAndCapture.mockResolvedValueOnce({
      audioDataUrl: "data:audio/mp3;base64,BBB",
      play: () => Promise.reject(new Error("autoplay blocked")),
    });

    await act(async () => {
      await result.current.handleSaveSelectedPhrase();
    });

    expect(addPhrase).toHaveBeenCalledTimes(1);
    expect(result.current.phraseSelectionMsg).toBeNull();
  });

  test("a successful save still clears the selection", async () => {
    const { result } = setup();
    openWith(result, "早晨啊");
    act(() => result.current.setPhraseTagSelection(["existing-tag"]));

    await act(async () => {
      await result.current.handleSaveSelectedPhrase();
    });

    expect(result.current.phraseSelectionMsg).toBeNull();
    expect(result.current.phraseSelectionText).toBe("");
    expect(result.current.phraseTagSelection).toEqual([]);
  });
});
