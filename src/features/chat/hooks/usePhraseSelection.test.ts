import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
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

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
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
  const { result } = renderHook(() =>
    usePhraseSelection({ addPhrase, activeLanguageCode: "yue-HK", userProfile: null, createTag })
  );
  return { result, addPhrase, createTag };
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
