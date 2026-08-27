import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Session } from "../../types";
import { BookmarksPage } from "./BookmarksPage";

// Two bugs under test:
// BM-11 — isCreatingTag / newTagName / isEditingTags are shared by both tag
//   bars, so a draft begun on Phrases stayed open after a tab switch and
//   silently created a SESSION tag (and vice versa).
// BM-05 — the session viewer must read live provider sessions, not the
//   snapshot captured when the conversation was opened.
// BM-08 (Task 10) — clicking the already-active Phrases tab cleared
//   selectedTagFilters as a side effect, discarding the user's filter
//   selection for no reason.
// Folded item B (Task 10) — an authEpoch change (cloud sign-in/out) must
//   close any open conversation view, so the snapshot fallback in
//   SessionViewer never shows the previous user's conversation.

interface BarDraftProps {
  isCreatingTag: boolean;
  newTagName: string;
  isEditingTags: boolean;
  setIsCreatingTag: (value: boolean) => void;
  setNewTagName: (value: string) => void;
  setIsEditingTags: (value: boolean) => void;
  selectedTagFilters?: Set<string>;
  setSelectedTagFilters?: (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
}

interface SessionsTabProps {
  onView: (session: Session) => void;
}

let phraseBar: BarDraftProps | null = null;
let sessionBar: BarDraftProps | null = null;
let viewerSessions: Session[] | null = null;
let viewerSession: Session | null | undefined = undefined;
let sessionsTabProps: SessionsTabProps | null = null;
let mockAuthEpoch = 0;

const SESSIONS: Session[] = [
  {
    id: "s1",
    title: "Kopi run",
    date: "2026-01-01",
    messages: [{ id: "m1", sender: "user", text: "one kopi please", dialectText: "一杯咖啡" }],
  },
];

vi.mock("../../app/context/ProfileProvider", () => ({
  useProfile: () => ({ userProfile: { id: "p1", name: "Test", activePersona: "personal" } }),
}));

vi.mock("../../app/context/LibraryProvider", () => ({
  useLibrary: () => ({
    phrases: [],
    toggleBookmark: vi.fn(),
    addPhrase: vi.fn(),
    updatePhrase: vi.fn(),
    sessions: SESSIONS,
    renameSession: vi.fn(),
    deleteSession: vi.fn(),
    deleteSessionMessage: vi.fn(),
    conversationLessons: [],
    saveConversationLesson: vi.fn(),
    phraseTags: [],
    sessionTags: [],
    createTag: vi.fn(),
    deleteTag: vi.fn(),
    setPhraseTags: vi.fn(),
    setSessionTags: vi.fn(),
  }),
}));

vi.mock("../../app/context/AuthProvider", () => ({
  useAuth: () => ({ authEpoch: mockAuthEpoch }),
}));

vi.mock("../../hooks/useActiveLanguageCode", () => ({
  useActiveLanguageCode: () => "yue-HK",
  useActiveCapabilities: () => ({ tts: true, stt: true }),
}));

vi.mock("../../app/components/tour/TourProvider", () => ({
  useTour: () => ({ isActive: false, activeTour: null, currentStep: 0 }),
}));

vi.mock("../../app/components/LanguageFilter", () => ({ LanguageFilter: () => null }));

vi.mock("sonner", () => {
  const toast = vi.fn();
  return { toast: Object.assign(toast, { success: vi.fn(), error: vi.fn(), info: vi.fn() }) };
});

vi.mock("./components/PhraseTagFilterBar", () => ({
  PhraseTagFilterBar: (props: BarDraftProps) => {
    phraseBar = props;
    return null;
  },
}));

vi.mock("./components/SessionTagFilterBar", () => ({
  SessionTagFilterBar: (props: BarDraftProps) => {
    sessionBar = props;
    return null;
  },
}));

vi.mock("./components/SessionViewer", () => ({
  SessionViewer: (props: { session: Session | null; sessions: Session[] }) => {
    viewerSession = props.session;
    viewerSessions = props.sessions;
    return null;
  },
}));

vi.mock("./components/PhrasesTab", () => ({ PhrasesTab: () => null }));
vi.mock("./components/SessionsTab", () => ({
  SessionsTab: (props: SessionsTabProps) => {
    sessionsTabProps = props;
    return null;
  },
}));
vi.mock("./components/PhraseSelectionSheet", () => ({ PhraseSelectionSheet: () => null }));
vi.mock("./components/SessionMenu", () => ({ SessionMenu: () => null }));
vi.mock("./components/DeleteSessionDialog", () => ({ DeleteSessionDialog: () => null }));

function requireBar(bar: BarDraftProps | null): BarDraftProps {
  if (!bar) throw new Error("the tag bar for the active tab has not rendered");
  return bar;
}

function requireSessionsTab(): SessionsTabProps {
  if (!sessionsTabProps) throw new Error("SessionsTab has not rendered");
  return sessionsTabProps;
}

/** Start a tag draft the way the bar's "New" and pencil buttons would. */
function startDraft(bar: BarDraftProps) {
  act(() => {
    bar.setIsCreatingTag(true);
    bar.setNewTagName("food");
    bar.setIsEditingTags(true);
  });
}

function expectNoDraft(bar: BarDraftProps) {
  expect(bar.isCreatingTag).toBe(false);
  expect(bar.newTagName).toBe("");
  expect(bar.isEditingTags).toBe(false);
}

beforeEach(() => {
  vi.clearAllMocks();
  phraseBar = null;
  sessionBar = null;
  viewerSessions = null;
  viewerSession = undefined;
  sessionsTabProps = null;
  mockAuthEpoch = 0;
});

afterEach(cleanup);

describe("BookmarksPage tab switching", () => {
  test("a phrase-tag draft does not leak into the conversations tab", () => {
    render(<BookmarksPage />);
    startDraft(requireBar(phraseBar));
    expect(requireBar(phraseBar).isCreatingTag).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Conversations" }));

    expectNoDraft(requireBar(sessionBar));
  });

  test("a session-tag draft does not leak back into the phrases tab", () => {
    render(<BookmarksPage />);
    fireEvent.click(screen.getByRole("button", { name: "Conversations" }));
    startDraft(requireBar(sessionBar));
    expect(requireBar(sessionBar).isEditingTags).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Phrases" }));

    expectNoDraft(requireBar(phraseBar));
  });
});

describe("BookmarksPage session viewer", () => {
  test("hands the viewer live provider sessions", () => {
    render(<BookmarksPage />);

    expect(viewerSessions).toBe(SESSIONS);
  });
});

describe("BookmarksPage phrase tag filters (BM-08)", () => {
  test("clicking the already-active Phrases tab does not clear tag filters", () => {
    render(<BookmarksPage />);
    act(() => requireBar(phraseBar).setSelectedTagFilters!(new Set(["t1"])));
    expect(requireBar(phraseBar).selectedTagFilters).toEqual(new Set(["t1"]));

    fireEvent.click(screen.getByRole("button", { name: "Phrases" }));

    expect(requireBar(phraseBar).selectedTagFilters).toEqual(new Set(["t1"]));
  });

  test("switching from Conversations to Phrases still clears tag filters", () => {
    render(<BookmarksPage />);
    act(() => requireBar(phraseBar).setSelectedTagFilters!(new Set(["t1"])));
    fireEvent.click(screen.getByRole("button", { name: "Conversations" }));

    fireEvent.click(screen.getByRole("button", { name: "Phrases" }));

    expect(requireBar(phraseBar).selectedTagFilters).toEqual(new Set());
  });
});

describe("BookmarksPage viewingSession reset on auth change (folded item B)", () => {
  test("clears the open conversation view when authEpoch changes", () => {
    const { rerender } = render(<BookmarksPage />);
    fireEvent.click(screen.getByRole("button", { name: "Conversations" }));
    act(() => requireSessionsTab().onView(SESSIONS[0]));
    expect(viewerSession).toEqual(SESSIONS[0]);

    mockAuthEpoch = 1;
    rerender(<BookmarksPage />);

    expect(viewerSession).toBeNull();
  });

  test("does not clear the view when authEpoch stays the same across a rerender", () => {
    const { rerender } = render(<BookmarksPage />);
    fireEvent.click(screen.getByRole("button", { name: "Conversations" }));
    act(() => requireSessionsTab().onView(SESSIONS[0]));

    rerender(<BookmarksPage />);

    expect(viewerSession).toEqual(SESSIONS[0]);
  });
});
