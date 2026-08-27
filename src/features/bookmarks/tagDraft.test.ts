import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, beforeEach } from "vitest";
import type { Tag } from "../../types";
import { commitTagDraft } from "./tagDraft";

// BM-01 — LibraryProvider.createTag dedupes by case-insensitive name + type,
// and a tag inside its 5s undo window is still in provider state. Committing
// the same name therefore handed back the doomed tag, which vanished when the
// timer fired. The commit path now revives the pending tag instead.

const mockToastSuccess = vi.fn();

vi.mock("sonner", () => {
  const toast = vi.fn();
  return {
    toast: Object.assign(toast, { success: (...args: unknown[]) => mockToastSuccess(...args) }),
  };
});

const FOOD: Tag = { id: "t1", name: "Food", type: "phrase", createdAt: "2026-01-01T00:00:00.000Z" };
const FOOD_SESSION: Tag = {
  id: "t2",
  name: "Food",
  type: "session",
  createdAt: "2026-01-01T00:00:00.000Z",
};

function setup(tags: Tag[], pendingIds: string[], cancelResult = true) {
  const createTag = vi.fn((name: string): Tag => ({
    id: "new",
    name,
    type: "phrase",
    createdAt: "2026-02-01T00:00:00.000Z",
  }));
  const cancelPendingTagDeletion = vi.fn(() => cancelResult);
  const run = (name: string, type: Tag["type"] = "phrase") =>
    commitTagDraft({
      name,
      type,
      tags,
      pendingTagDeletions: new Set(pendingIds),
      cancelPendingTagDeletion,
      createTag,
    });
  return { run, createTag, cancelPendingTagDeletion };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("commitTagDraft", () => {
  test("restores a tag that is inside its undo window instead of recreating it", () => {
    const { run, createTag, cancelPendingTagDeletion } = setup([FOOD], ["t1"]);

    run("food");

    expect(cancelPendingTagDeletion).toHaveBeenCalledWith("t1");
    expect(createTag).not.toHaveBeenCalled();
    expect(mockToastSuccess).toHaveBeenCalledWith("Tag restored.");
  });

  test("creates the tag when the name matches nothing pending", () => {
    const { run, createTag, cancelPendingTagDeletion } = setup([FOOD], []);

    run("Drinks");

    expect(cancelPendingTagDeletion).not.toHaveBeenCalled();
    expect(createTag).toHaveBeenCalledWith("Drinks", "phrase");
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  test("an existing tag that is not pending deletion still goes through createTag", () => {
    const { run, createTag, cancelPendingTagDeletion } = setup([FOOD], []);

    run("food");

    expect(cancelPendingTagDeletion).not.toHaveBeenCalled();
    expect(createTag).toHaveBeenCalledWith("food", "phrase");
  });

  test("falls back to creating when the pending delete already committed", () => {
    const { run, createTag, cancelPendingTagDeletion } = setup([FOOD], ["t1"], false);

    run("food");

    expect(cancelPendingTagDeletion).toHaveBeenCalledWith("t1");
    expect(createTag).toHaveBeenCalledWith("food", "phrase");
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  test("a pending tag of the other type is not treated as a match", () => {
    const { run, createTag, cancelPendingTagDeletion } = setup([FOOD_SESSION], ["t2"]);

    run("food", "phrase");

    expect(cancelPendingTagDeletion).not.toHaveBeenCalled();
    expect(createTag).toHaveBeenCalledWith("food", "phrase");
  });

  test("trims the draft name and ignores a blank one", () => {
    const { run, createTag } = setup([], []);

    run("  Drinks  ");
    expect(createTag).toHaveBeenCalledWith("Drinks", "phrase");

    createTag.mockClear();
    run("   ");
    expect(createTag).not.toHaveBeenCalled();
  });
});
