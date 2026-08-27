import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Tag } from "../../../types";
import { PhraseTagFilterBar } from "./PhraseTagFilterBar";

// BM-01 — typing the name of a tag that is still inside its 5s undo window
// used to call createTag, which dedupes by name and handed back the doomed
// tag: the "recreated" tag silently disappeared when the timer fired. Both
// commit paths (Enter and the confirm button) must revive it instead.

const mockToastSuccess = vi.fn();

vi.mock("sonner", () => {
  const toast = vi.fn();
  return {
    toast: Object.assign(toast, { success: (...args: unknown[]) => mockToastSuccess(...args) }),
  };
});

const FOOD: Tag = { id: "t1", name: "Food", type: "phrase", createdAt: "2026-01-01T00:00:00.000Z" };

function setup(overrides: Partial<Parameters<typeof PhraseTagFilterBar>[0]> = {}) {
  const createTag = vi.fn(() => FOOD);
  const cancelPendingTagDeletion = vi.fn(() => true);
  const setNewTagName = vi.fn();
  const setIsCreatingTag = vi.fn();
  const props = {
    phraseTags: [FOOD],
    pendingTagDeletions: new Set(["t1"]),
    selectedTagFilters: new Set<string>(),
    setSelectedTagFilters: vi.fn(),
    isEditingTags: false,
    setIsEditingTags: vi.fn(),
    isCreatingTag: true,
    setIsCreatingTag,
    newTagName: "food",
    setNewTagName,
    tagsExpanded: false,
    setTagsExpanded: vi.fn(),
    createTag,
    cancelPendingTagDeletion,
    onDeleteTag: vi.fn(),
    ...overrides,
  };
  render(<PhraseTagFilterBar {...props} />);
  return { createTag, cancelPendingTagDeletion, setNewTagName, setIsCreatingTag };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("PhraseTagFilterBar tag drafts", () => {
  test("Enter revives a tag that is inside its undo window", () => {
    const { createTag, cancelPendingTagDeletion, setNewTagName, setIsCreatingTag } = setup();

    fireEvent.keyDown(screen.getByPlaceholderText("Tag name"), { key: "Enter" });

    expect(cancelPendingTagDeletion).toHaveBeenCalledWith("t1");
    expect(createTag).not.toHaveBeenCalled();
    expect(mockToastSuccess).toHaveBeenCalledWith("Tag restored.");
    expect(setNewTagName).toHaveBeenCalledWith("");
    expect(setIsCreatingTag).toHaveBeenCalledWith(false);
  });

  test("the confirm button revives a tag that is inside its undo window", () => {
    const { createTag, cancelPendingTagDeletion } = setup();

    fireEvent.click(screen.getByRole("button", { name: /create tag/i }));

    expect(cancelPendingTagDeletion).toHaveBeenCalledWith("t1");
    expect(createTag).not.toHaveBeenCalled();
  });

  test("a name with nothing pending still creates a phrase tag", () => {
    const { createTag, cancelPendingTagDeletion } = setup({
      pendingTagDeletions: new Set<string>(),
      newTagName: "Drinks",
    });

    fireEvent.keyDown(screen.getByPlaceholderText("Tag name"), { key: "Enter" });

    expect(cancelPendingTagDeletion).not.toHaveBeenCalled();
    expect(createTag).toHaveBeenCalledWith("Drinks", "phrase");
  });

  test("tags inside their undo window are hidden from the filter chips", () => {
    setup();

    expect(screen.queryByRole("button", { name: "Food" })).not.toBeInTheDocument();
  });
});
