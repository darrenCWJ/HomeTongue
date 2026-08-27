import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useSessionLessonActions } from "./useSessionLessonActions";

// BM-09 — commitTitle with an empty (or whitespace-only) trimmed name used to
// silently close the editor as if the rename had saved. It now keeps the
// editor open and surfaces an explicit error instead.

const mockToastError = vi.fn();

vi.mock("sonner", () => {
  const toast = vi.fn();
  return {
    toast: Object.assign(toast, {
      success: vi.fn(),
      error: (...args: unknown[]) => mockToastError(...args),
      info: vi.fn(),
    }),
  };
});

function setup() {
  const renameSession = vi.fn();
  const saveConversationLesson = vi.fn();
  const { result } = renderHook(() =>
    useSessionLessonActions({ renameSession, conversationLessons: [], saveConversationLesson })
  );
  return { result, renameSession };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("useSessionLessonActions.commitTitle — BM-09", () => {
  test("renames and closes the editor when the trimmed title is non-empty", () => {
    const { result, renameSession } = setup();
    act(() => result.current.startEditing("s1", "Old title"));
    act(() => result.current.setEditingTitle("New title"));

    act(() => result.current.commitTitle("s1"));

    expect(renameSession).toHaveBeenCalledWith("s1", "New title");
    expect(result.current.editingSessionId).toBeNull();
    expect(mockToastError).not.toHaveBeenCalled();
  });

  test("keeps the editor open and errors when the trimmed title is empty", () => {
    const { result, renameSession } = setup();
    act(() => result.current.startEditing("s1", "Old title"));
    act(() => result.current.setEditingTitle("   "));

    act(() => result.current.commitTitle("s1"));

    expect(renameSession).not.toHaveBeenCalled();
    expect(result.current.editingSessionId).toBe("s1");
    expect(mockToastError).toHaveBeenCalledWith("Name can't be empty.");
  });

  test("an all-whitespace title does not masquerade as a successful rename", () => {
    const { result, renameSession } = setup();
    act(() => result.current.startEditing("s1", "Old title"));
    act(() => result.current.setEditingTitle(""));

    act(() => result.current.commitTitle("s1"));

    expect(renameSession).not.toHaveBeenCalled();
    expect(result.current.editingSessionId).not.toBeNull();
  });
});
