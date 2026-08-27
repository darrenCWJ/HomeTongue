import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Message, Phrase } from "../../types";
import type { PreparedTranslation } from "./utils/prepareTranslation";
import type { RecordRef } from "./hooks/useMicRecording";
import { ChatPage } from "./ChatPage";

// The conversation-reset contract (CHAT-02, CHAT-03, CHAT-09):
// New Chat used to be the only path that invalidated in-flight suggestions,
// the TTS prefetch cache and the 60s dialect append window. Saving and
// switching dialect left all of it live, so the next recording appended to a
// conversation that was already gone and chips/audio from the old dialect
// reappeared. All three now run one shared reset, which also bumps a chat
// epoch so awaits already in flight discard their results.

const mockDiscardChat = vi.fn();
const mockSaveSession = vi.fn();
const mockInvalidateSuggestions = vi.fn();
const mockSetLatestSuggestions = vi.fn();
const mockSetPendingEnglish = vi.fn();
const mockHandleBubblePointerDown = vi.fn();
const mockToastError = vi.fn();
const mockToastInfo = vi.fn();

let mockLanguageCode: string;
let messages: Message[];
let prefetchCache: Map<string, Promise<PreparedTranslation>>;
let lastRecordRef: { current: RecordRef | null };
let chatEpochRef: { current: number } | undefined;
let setStage: (stage: "transcribing" | "translating" | null) => void;
// CHAT-07: null except when a test opens the transcript-review overlay.
let mockPendingEnglish: { text: string; resultPromise: Promise<PreparedTranslation> } | null;
// CHAT-07 TOCTOU: null except when a test simulates the long-press timer
// having already fired (independently of when the guard last checked).
let mockPhraseSelectionMsg: Message | null;
let capturedOnBubblePointerDown: ((e: ReactPointerEvent, msg: Message) => void) | undefined;

vi.mock("../../app/context/ProfileProvider", () => ({
  useProfile: () => ({
    tone: "casual",
    userProfile: { id: "p1", name: "Test", activePersona: "personal" },
    updateUserProfile: vi.fn(),
    activePersona: "personal",
    dialect: "Cantonese",
    setDialect: vi.fn(),
  }),
}));

vi.mock("../../app/context/LibraryProvider", () => ({
  useLibrary: () => ({
    phrases: [] as Phrase[],
    toggleBookmark: vi.fn(),
    addPhrase: vi.fn(),
    updatePhrase: vi.fn(),
    phraseTags: [],
    sessionTags: [],
    createTag: vi.fn(),
  }),
}));

vi.mock("../../app/context/ChatProvider", () => ({
  useChat: () => ({
    messages,
    addMessage: vi.fn(),
    addBotSuggestions: vi.fn(),
    updateMessage: vi.fn(),
    removeMessage: vi.fn(),
    saveSession: (...args: unknown[]) => mockSaveSession(...args),
    discardChat: (...args: unknown[]) => mockDiscardChat(...args),
  }),
}));

vi.mock("../../hooks/useActiveLanguageCode", () => ({
  useActiveLanguageCode: () => mockLanguageCode,
  useActiveCapabilities: () => ({ tts: true, stt: true }),
}));

vi.mock("../../app/components/tour/TourProvider", () => ({
  useTour: () => ({ isActive: false, activeTour: null }),
}));

vi.mock("../../services/speechSampleService", () => ({
  recordCorrection: vi.fn(),
  consentFromProfile: vi.fn(() => false),
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
    info: (...args: unknown[]) => mockToastInfo(...args),
  },
}));

// The flow hooks are stubbed so this file tests only ChatPage's reset wiring:
// what it clears, and which actions run it. Each stub captures the params it
// was handed so the test can inspect the shared refs ChatPage owns.
vi.mock("./hooks/usePhraseReplay", () => ({
  usePhraseReplay: () => ({
    playingId: null,
    setPlayingId: vi.fn(),
    replayPhrase: vi.fn(),
    replayPhraseSlow: vi.fn(),
  }),
}));

vi.mock("./hooks/useSuggestionFlow", () => ({
  useSuggestionFlow: () => ({
    latestSuggestions: [],
    setLatestSuggestions: mockSetLatestSuggestions,
    fetchSuggestions: vi.fn(),
    prefetchCacheRef: { current: prefetchCache },
    invalidateSuggestions: mockInvalidateSuggestions,
  }),
}));

vi.mock("./hooks/useReplyFlow", () => ({
  useReplyFlow: (params: {
    chatEpochRef: { current: number };
    lastRecordRef: { current: RecordRef | null };
  }) => {
    chatEpochRef = params.chatEpochRef;
    lastRecordRef = params.lastRecordRef;
    return {
      pendingEnglish: mockPendingEnglish,
      setPendingEnglish: mockSetPendingEnglish,
      pendingEditText: "",
      setPendingEditText: vi.fn(),
      isEditingPending: false,
      setIsEditingPending: vi.fn(),
      isTyping: false,
      setIsTyping: vi.fn(),
      typedReply: "",
      setTypedReply: vi.fn(),
      confirmEnglishReply: vi.fn(),
      cancelEnglishReply: vi.fn(),
      handleReply: vi.fn(),
      handleSubmitTyped: vi.fn(),
    };
  },
}));

vi.mock("./hooks/useMicRecording", () => ({
  useMicRecording: (params: { setStage: (stage: "transcribing" | "translating" | null) => void }) => {
    setStage = params.setStage;
    return {
      listeningMode: null,
      isListening: false,
      isTapMode: false,
      handleMicPointerDown: vi.fn(),
      handleMicPointerUp: vi.fn(),
      handleMicPointerLeave: vi.fn(),
      startListeningCantonese: vi.fn(),
      startListeningEnglish: vi.fn(),
    };
  },
}));

vi.mock("./hooks/usePhraseSelection", () => ({
  usePhraseSelection: () => ({
    phraseSelectionMsg: mockPhraseSelectionMsg,
    phraseSelectionText: "",
    setPhraseSelectionText: vi.fn(),
    phraseTagSelection: [],
    setPhraseTagSelection: vi.fn(),
    newTagInput: "",
    setNewTagInput: vi.fn(),
    isCreatingPhraseTag: false,
    setIsCreatingPhraseTag: vi.fn(),
    isSavingPhrase: false,
    handleBubblePointerDown: mockHandleBubblePointerDown,
    cancelBubbleLongPress: vi.fn(),
    handleBubblePointerMove: vi.fn(),
    handleSaveSelectedPhrase: vi.fn(),
    cancelPhraseSelection: vi.fn(),
  }),
}));

// Child stubs: only the two controls this test drives render anything.
vi.mock("./components/ChatHeader", () => ({
  ChatHeader: ({ onNewChat, onOpenSaveDialog }: { onNewChat: () => void; onOpenSaveDialog: () => void }) => (
    <div>
      <button onClick={onNewChat}>new chat</button>
      <button onClick={onOpenSaveDialog}>open save</button>
    </div>
  ),
}));

vi.mock("./components/SaveSessionDialog", () => ({
  SaveSessionDialog: ({
    isOpen,
    setSaveTitle,
    onConfirm,
  }: {
    isOpen: boolean;
    setSaveTitle: (value: string) => void;
    onConfirm: () => void;
  }) =>
    isOpen ? (
      <div>
        <button onClick={() => setSaveTitle("Kopi run")}>type title</button>
        <button onClick={onConfirm}>confirm save</button>
      </div>
    ) : null,
}));

vi.mock("./components/DemoBubble", () => ({ DemoBubble: () => null }));
vi.mock("./components/MessageList", () => ({
  MessageList: (props: { onBubblePointerDown: (e: ReactPointerEvent, msg: Message) => void }) => {
    capturedOnBubblePointerDown = props.onBubblePointerDown;
    return null;
  },
}));
vi.mock("./components/ActionBar", () => ({ ActionBar: () => <div>action bar</div> }));
vi.mock("./components/TypingOverlay", () => ({ TypingOverlay: () => null }));
vi.mock("./components/PersonaSheet", () => ({ PersonaSheet: () => null }));
vi.mock("./components/DialectSheet", () => ({ DialectSheet: () => null }));
vi.mock("./components/PhraseSaveSheet", () => ({
  PhraseSaveSheet: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div>phrase save sheet open</div> : null),
}));
vi.mock("./components/PendingEnglishOverlay", () => ({ PendingEnglishOverlay: () => null }));

const RECORD: RecordRef = {
  msgId: "m1",
  suggestionMsgId: "sug-1",
  mode: "cantonese",
  timestamp: Date.now(),
  fullText: "早晨",
  audioDataUrls: ["data:audio/webm;base64,AAA"],
};

const click = (label: string) => fireEvent.click(screen.getByRole("button", { name: label }));

/**
 * Seed the state a reset must clear: an open append window and a warm
 * prefetch cache, both reachable through the refs ChatPage owns.
 */
function seedStaleState() {
  prefetchCache.set("thank you:casual", Promise.resolve({} as PreparedTranslation));
  lastRecordRef.current = RECORD;
}

function expectConversationReset(epochBefore: number) {
  expect(mockInvalidateSuggestions).toHaveBeenCalled();
  expect(prefetchCache.size).toBe(0);
  expect(lastRecordRef.current).toBeNull();
  expect(mockSetPendingEnglish).toHaveBeenCalledWith(null);
  expect(mockSetLatestSuggestions).toHaveBeenCalledWith([]);
  expect(chatEpochRef?.current).toBe(epochBefore + 1);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLanguageCode = "yue-HK";
  messages = [{ id: "m1", sender: "bot", text: "早晨", englishTranslation: "good morning" }];
  prefetchCache = new Map();
  chatEpochRef = undefined;
  // Placeholder: ChatPage owns lastRecordRef and chatEpochRef, so the
  // reply-flow stub re-captures the real ones on the first render.
  lastRecordRef = { current: null };
  mockPendingEnglish = null;
  mockPhraseSelectionMsg = null;
  capturedOnBubblePointerDown = undefined;
});

afterEach(cleanup);

describe("ChatPage conversation reset", () => {
  test("New Chat clears the append window, chips and prefetched audio", () => {
    render(<ChatPage />);
    const epochBefore = chatEpochRef?.current ?? 0;
    seedStaleState();

    click("new chat");

    expectConversationReset(epochBefore);
    expect(mockDiscardChat).toHaveBeenCalledWith(messages);
  });

  test("saving the conversation resets it too", () => {
    render(<ChatPage />);
    const epochBefore = chatEpochRef?.current ?? 0;
    seedStaleState();

    click("open save");
    click("type title");
    click("confirm save");

    expect(mockSaveSession).toHaveBeenCalledWith(messages, "Kopi run", undefined);
    expectConversationReset(epochBefore);
  });

  test("switching dialect resets in-flight and cached state without discarding the chat", () => {
    const { rerender } = render(<ChatPage />);
    const epochBefore = chatEpochRef?.current ?? 0;
    seedStaleState();

    mockLanguageCode = "nan-TW";
    rerender(<ChatPage />);

    expectConversationReset(epochBefore);
    expect(mockDiscardChat).not.toHaveBeenCalled();
  });

  test("mounting and re-rendering in the same dialect resets nothing", () => {
    const { rerender } = render(<ChatPage />);
    // Mounting is not a dialect switch: the effect must not fire on it.
    expect(chatEpochRef?.current).toBe(0);
    seedStaleState();

    rerender(<ChatPage />);

    expect(mockInvalidateSuggestions).not.toHaveBeenCalled();
    expect(prefetchCache.size).toBe(1);
    expect(lastRecordRef.current).toBe(RECORD);
    expect(chatEpochRef?.current).toBe(0);
  });

  test("New Chat behind an open save dialog closes it", () => {
    render(<ChatPage />);

    click("open save");
    expect(screen.getByRole("button", { name: "confirm save" })).toBeInTheDocument();
    click("new chat");

    // The dialog was opened for a conversation that no longer exists; leaving
    // it up would offer to save nothing.
    expect(screen.queryByRole("button", { name: "confirm save" })).not.toBeInTheDocument();
    expect(mockDiscardChat).toHaveBeenCalledWith(messages);
  });

  test("a reset unblocks the input even when the discarded turn was still translating", () => {
    render(<ChatPage />);
    act(() => setStage("translating"));
    expect(screen.queryByText("action bar")).not.toBeInTheDocument();

    click("new chat");

    // The discarded translation's own request may still be seconds from
    // settling; the fresh conversation must be usable immediately.
    expect(screen.getByText("action bar")).toBeInTheDocument();
  });
});

// CHAT-07 — the save dialog and the phrase-selection sheet share the
// transcript-review overlay's z-30, and paint underneath it (later JSX
// siblings win ties). Opening either while the overlay is up used to happen
// invisibly, then surface unexpectedly once the overlay closed.
//
// Coordinator round-2 IMPORTANT #1 — the long-press guard used to live here
// too, checked at pointer-down: it toasted (as an error) on every bubble
// pointer-down while the overlay was open, including scroll drags and taps
// that were never going to open anything, and left a race where
// pendingEnglish turning true up to 500ms later (after that check already
// passed) still let the sheet open. That guard now lives inside
// usePhraseSelection's own long-press callback instead (see
// usePhraseSelection.test.ts's "transcript-review guard" suite) — it only
// fires once a real long-press has actually completed. ChatPage keeps only
// the save-dialog guard, which is a single atomic click with no such
// window, and the render gate below as defense-in-depth for a sheet that
// was already open.
describe("ChatPage transcript-review exclusivity (CHAT-07)", () => {
  function openPendingEnglishTranscript() {
    mockPendingEnglish = {
      text: "one kopi please",
      resultPromise: new Promise<PreparedTranslation>(() => {}),
    };
  }

  test("opening the save dialog while a transcript is pending is ignored", () => {
    openPendingEnglishTranscript();
    render(<ChatPage />);

    click("open save");

    expect(screen.queryByRole("button", { name: "confirm save" })).not.toBeInTheDocument();
    expect(mockToastInfo).toHaveBeenCalledWith("Finish reviewing your transcript first.");
    expect(mockToastError).not.toHaveBeenCalled();
  });

  test("opening the save dialog when nothing is pending proceeds as usual", () => {
    render(<ChatPage />);

    click("open save");

    expect(screen.getByRole("button", { name: "confirm save" })).toBeInTheDocument();
    expect(mockToastInfo).not.toHaveBeenCalled();
  });

  test("the bubble pointer-down handler is passed through unwrapped", () => {
    // usePhraseSelection's own handleBubblePointerDown does the transcript-
    // review check now (at the moment a long-press actually completes, not
    // at pointer-down) — ChatPage must not reintroduce a pointer-down-time
    // wrapper around it.
    render(<ChatPage />);

    expect(capturedOnBubblePointerDown).toBe(mockHandleBubblePointerDown);
  });

  // The pointer-down guard alone would leave a gap: usePhraseSelection's own
  // long-press timer fires ~500ms after pointer-down, with no re-check at
  // that later moment. If pendingEnglish turns non-null anywhere in that
  // window (an ordinary STT round trip), phraseSelectionMsg could still get
  // set — this simulates that later moment directly. The sheet itself must
  // not render while pendingEnglish is truthy, no matter when
  // phraseSelectionMsg was set (defense-in-depth alongside
  // usePhraseSelection's own live check).
  test("the sheet does not render if pendingEnglish turns truthy after the long-press already started", () => {
    mockPendingEnglish = {
      text: "one kopi please",
      resultPromise: new Promise<PreparedTranslation>(() => {}),
    };
    mockPhraseSelectionMsg = messages[0];
    render(<ChatPage />);

    expect(screen.queryByText("phrase save sheet open")).not.toBeInTheDocument();
  });

  test("the sheet renders normally once nothing is pending", () => {
    mockPhraseSelectionMsg = messages[0];
    render(<ChatPage />);

    expect(screen.getByText("phrase save sheet open")).toBeInTheDocument();
  });
});
