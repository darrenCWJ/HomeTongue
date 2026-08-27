import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Phrase } from "../../../types";
import { useBookmarkPhraseSelection } from "./useBookmarkPhraseSelection";
import { isSavedListMember } from "../savedListMembership";

// BM-03 — the bookmark toggle-off path only flipped isBookmarked, leaving a
// tagged phrase in the Saved list (membership is isBookmarked ||
// tags.length > 0) with a filled icon. Toggling off now mirrors PhraseCard's
// un-bookmark and clears tags too.
// BM-06 — bookmarking a message with no dialect text silently no-opped; the
// bookmark path must now tell the user there was nothing to save. The
// long-press guard is deliberately left silent (no sheet, no toast).

const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();

vi.mock("sonner", () => {
  const toast = vi.fn();
  return {
    toast: Object.assign(toast, {
      success: (...args: unknown[]) => mockToastSuccess(...args),
      error: (...args: unknown[]) => mockToastError(...args),
      info: vi.fn(),
    }),
  };
});

const TAGGED_BOOKMARKED: Phrase = {
  id: "m1",
  original: "one kopi please",
  dialect: "一杯咖啡",
  pronunciation: "",
  isBookmarked: true,
  context: "",
  tags: ["t1"],
};

function setup(phrases: Phrase[]) {
  const addPhrase = vi.fn();
  const toggleBookmark = vi.fn();
  const updatePhrase = vi.fn();
  const { result } = renderHook(() =>
    useBookmarkPhraseSelection({
      phrases,
      addPhrase,
      toggleBookmark,
      updatePhrase,
      activeLanguageCode: "yue-HK",
    })
  );
  return { result, addPhrase, toggleBookmark, updatePhrase };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("useBookmarkPhraseSelection.handleSessionBookmark — BM-03", () => {
  test("toggling off a bookmarked+tagged phrase clears tags via updatePhrase, not toggleBookmark", () => {
    const { result, updatePhrase, toggleBookmark } = setup([TAGGED_BOOKMARKED]);

    act(() => result.current.handleSessionBookmark({ id: "m1", sender: "user", text: "one kopi please" }));

    expect(toggleBookmark).not.toHaveBeenCalled();
    expect(updatePhrase).toHaveBeenCalledWith({ ...TAGGED_BOOKMARKED, isBookmarked: false, tags: [] });
    const [updated] = updatePhrase.mock.calls[0] as [Phrase];
    expect(isSavedListMember(updated)).toBe(false);
  });

  test("toggling on a not-yet-bookmarked existing phrase still uses toggleBookmark", () => {
    const unbookmarked: Phrase = { ...TAGGED_BOOKMARKED, isBookmarked: false, tags: [] };
    const { result, updatePhrase, toggleBookmark } = setup([unbookmarked]);

    act(() => result.current.handleSessionBookmark({ id: "m1", sender: "user", text: "one kopi please" }));

    expect(toggleBookmark).toHaveBeenCalledWith("m1");
    expect(updatePhrase).not.toHaveBeenCalled();
  });
});

describe("useBookmarkPhraseSelection.handleSessionBookmark — BM-06", () => {
  test("bookmarking a message with no dialect text tells the user instead of silently no-opping", () => {
    const { result, addPhrase } = setup([]);

    act(() => result.current.handleSessionBookmark({ id: "m2", sender: "user", text: "" }));

    expect(addPhrase).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith("Nothing to save from this message.");
  });

  test("bookmarking a bot message with no translation tells the user too", () => {
    const { result, addPhrase } = setup([]);

    act(() => result.current.handleSessionBookmark({ id: "m3", sender: "bot", text: "" }));

    expect(addPhrase).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith("Nothing to save from this message.");
  });

  test("the long-press guard stays silent when there is no dialect text", () => {
    const { result } = setup([]);
    const event = {} as ReactPointerEvent;

    act(() => result.current.handleBubblePointerDown(event, "", "no dialect text"));

    expect(mockToastError).not.toHaveBeenCalled();
  });
});
