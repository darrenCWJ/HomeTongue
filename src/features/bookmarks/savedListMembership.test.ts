import "@testing-library/jest-dom/vitest";
import { describe, test, expect, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import type { Phrase } from "../../types";
import { isSavedListMember } from "./savedListMembership";

// BM-03 — SessionViewer's bookmark toggle-off only flipped isBookmarked,
// leaving a tagged phrase in the Saved list (membership is
// isBookmarked || tags.length > 0) with a filled bookmark icon. This pure
// filter is the single source of truth for that membership rule so the
// un-bookmark fix (see useBookmarkPhraseSelection.ts) can be checked against
// it directly.

const BASE: Phrase = {
  id: "p1",
  original: "one kopi please",
  dialect: "一杯咖啡",
  pronunciation: "jat1 bui1 gaa3 fe1",
  isBookmarked: false,
  context: "",
};

afterEach(cleanup);

describe("isSavedListMember", () => {
  test("a bookmarked phrase with no tags is a member", () => {
    expect(isSavedListMember({ ...BASE, isBookmarked: true })).toBe(true);
  });

  test("a tagged, non-bookmarked phrase is still a member", () => {
    expect(isSavedListMember({ ...BASE, isBookmarked: false, tags: ["t1"] })).toBe(true);
  });

  test("a bookmarked and tagged phrase is a member", () => {
    expect(isSavedListMember({ ...BASE, isBookmarked: true, tags: ["t1"] })).toBe(true);
  });

  test("a phrase with neither a bookmark nor tags is not a member", () => {
    expect(isSavedListMember({ ...BASE, isBookmarked: false, tags: [] })).toBe(false);
  });

  test("a phrase with an undefined tags array and no bookmark is not a member", () => {
    expect(isSavedListMember({ ...BASE, isBookmarked: false, tags: undefined })).toBe(false);
  });
});
