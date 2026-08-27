import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PersonaType, Tag } from "../../../types";
import { SessionTagFilterBar } from "./SessionTagFilterBar";

// BM-01, session side — same undo-window recreate trap as the phrase bar.

const mockToastSuccess = vi.fn();

vi.mock("sonner", () => {
  const toast = vi.fn();
  return {
    toast: Object.assign(toast, { success: (...args: unknown[]) => mockToastSuccess(...args) }),
  };
});

const HAWKER: Tag = {
  id: "t1",
  name: "Hawker",
  type: "session",
  createdAt: "2026-01-01T00:00:00.000Z",
};

function setup(overrides: Partial<Parameters<typeof SessionTagFilterBar>[0]> = {}) {
  const createTag = vi.fn(() => HAWKER);
  const cancelPendingTagDeletion = vi.fn(() => true);
  const props = {
    sessionTags: [HAWKER],
    pendingTagDeletions: new Set(["t1"]),
    sessionTagFilters: new Set<string>(),
    setSessionTagFilters: vi.fn(),
    sessionPersonaFilters: new Set<PersonaType>(),
    setSessionPersonaFilters: vi.fn(),
    isEditingTags: false,
    setIsEditingTags: vi.fn(),
    isCreatingTag: true,
    setIsCreatingTag: vi.fn(),
    newTagName: "hawker",
    setNewTagName: vi.fn(),
    tagsExpanded: false,
    setTagsExpanded: vi.fn(),
    createTag,
    cancelPendingTagDeletion,
    onDeleteTag: vi.fn(),
    ...overrides,
  };
  render(<SessionTagFilterBar {...props} />);
  return { createTag, cancelPendingTagDeletion };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("SessionTagFilterBar tag drafts", () => {
  test("Enter revives a session tag that is inside its undo window", () => {
    const { createTag, cancelPendingTagDeletion } = setup();

    fireEvent.keyDown(screen.getByPlaceholderText("Tag name"), { key: "Enter" });

    expect(cancelPendingTagDeletion).toHaveBeenCalledWith("t1");
    expect(createTag).not.toHaveBeenCalled();
    expect(mockToastSuccess).toHaveBeenCalledWith("Tag restored.");
  });

  test("the confirm button revives a session tag that is inside its undo window", () => {
    const { createTag, cancelPendingTagDeletion } = setup();

    fireEvent.click(screen.getByRole("button", { name: /create tag/i }));

    expect(cancelPendingTagDeletion).toHaveBeenCalledWith("t1");
    expect(createTag).not.toHaveBeenCalled();
  });

  test("a name with nothing pending still creates a session tag", () => {
    const { createTag, cancelPendingTagDeletion } = setup({
      pendingTagDeletions: new Set<string>(),
      newTagName: "Kopitiam",
    });

    fireEvent.keyDown(screen.getByPlaceholderText("Tag name"), { key: "Enter" });

    expect(cancelPendingTagDeletion).not.toHaveBeenCalled();
    expect(createTag).toHaveBeenCalledWith("Kopitiam", "session");
  });
});
