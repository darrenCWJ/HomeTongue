import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useState } from "react";
import { useUndoableDeletions } from "./useUndoableDeletions";

// Three bugs under test:
// BM-01 — a tag inside its 5s undo window still exists in provider state, so
//   "recreating" it handed back the doomed tag. The hook now exposes
//   cancelPendingTagDeletion so the create path can revive it instead.
// BM-05 — the message-deletion timer patched the viewer snapshot through a
//   mount-bound setter, resurrecting deleted messages on remount. The timer
//   now only writes to the provider.
// BM-07 — Undo restored the tag but not the filter selections the delete had
//   eagerly cleared.

const mockToast = vi.fn();

vi.mock("sonner", () => {
  const toast = (...args: unknown[]) => mockToast(...args);
  return { toast: Object.assign(toast, { success: vi.fn(), error: vi.fn(), info: vi.fn() }) };
});

interface SetupOptions {
  phraseFilters?: string[];
  sessionFilters?: string[];
}

function setup({ phraseFilters = [], sessionFilters = [] }: SetupOptions = {}) {
  const deleteTag = vi.fn();
  const deleteSessionMessage = vi.fn();
  const { result } = renderHook(() => {
    const [selectedTagFilters, setSelectedTagFilters] = useState<Set<string>>(() => new Set(phraseFilters));
    const [sessionTagFilters, setSessionTagFilters] = useState<Set<string>>(() => new Set(sessionFilters));
    const undoable = useUndoableDeletions({
      deleteTag,
      deleteSessionMessage,
      selectedTagFilters,
      setSelectedTagFilters,
      sessionTagFilters,
      setSessionTagFilters,
    });
    return { ...undoable, selectedTagFilters, sessionTagFilters };
  });
  return { result, deleteTag, deleteSessionMessage };
}

/** The Undo handler sonner was handed for the most recent toast. */
function lastUndo(): () => void {
  const options = mockToast.mock.calls.at(-1)?.[1] as { action?: { onClick?: () => void } } | undefined;
  const onClick = options?.action?.onClick;
  if (!onClick) throw new Error("the last toast carried no Undo action");
  return onClick;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("useUndoableDeletions — tags", () => {
  test("cancelPendingTagDeletion stops the pending delete from ever committing", () => {
    const { result, deleteTag } = setup();

    act(() => result.current.handleDeleteTag("t1"));
    expect(result.current.pendingTagDeletions.has("t1")).toBe(true);

    let cancelled = false;
    act(() => {
      cancelled = result.current.cancelPendingTagDeletion("t1");
    });

    expect(cancelled).toBe(true);
    expect(result.current.pendingTagDeletions.has("t1")).toBe(false);

    act(() => vi.advanceTimersByTime(6000));
    expect(deleteTag).not.toHaveBeenCalled();
  });

  test("cancelPendingTagDeletion reports false when nothing is pending for that tag", () => {
    const { result } = setup();

    let cancelled = true;
    act(() => {
      cancelled = result.current.cancelPendingTagDeletion("never-deleted");
    });

    expect(cancelled).toBe(false);
  });

  test("cancelPendingTagDeletion reports false once the delete has already committed", () => {
    const { result, deleteTag } = setup();

    act(() => result.current.handleDeleteTag("t1"));
    act(() => vi.advanceTimersByTime(5000));
    expect(deleteTag).toHaveBeenCalledWith("t1");

    let cancelled = true;
    act(() => {
      cancelled = result.current.cancelPendingTagDeletion("t1");
    });

    expect(cancelled).toBe(false);
  });

  test("the delete commits and clears its pending mark when the window lapses", () => {
    const { result, deleteTag } = setup();

    act(() => result.current.handleDeleteTag("t1"));
    act(() => vi.advanceTimersByTime(5000));

    expect(deleteTag).toHaveBeenCalledTimes(1);
    expect(deleteTag).toHaveBeenCalledWith("t1");
    expect(result.current.pendingTagDeletions.size).toBe(0);
  });

  test("Undo restores the filter selections the delete cleared", () => {
    const { result, deleteTag } = setup({ phraseFilters: ["t1", "t2"], sessionFilters: ["t1"] });

    act(() => result.current.handleDeleteTag("t1"));
    expect(result.current.selectedTagFilters.has("t1")).toBe(false);
    expect(result.current.sessionTagFilters.has("t1")).toBe(false);

    const undo = lastUndo();
    act(() => undo());

    expect(result.current.selectedTagFilters.has("t1")).toBe(true);
    expect(result.current.selectedTagFilters.has("t2")).toBe(true);
    expect(result.current.sessionTagFilters.has("t1")).toBe(true);
    expect(result.current.pendingTagDeletions.size).toBe(0);

    act(() => vi.advanceTimersByTime(6000));
    expect(deleteTag).not.toHaveBeenCalled();
  });

  test("Undo does not select filters the tag was never part of", () => {
    const { result } = setup({ phraseFilters: ["t1"] });

    act(() => result.current.handleDeleteTag("t1"));
    act(() => lastUndo()());

    expect(result.current.selectedTagFilters.has("t1")).toBe(true);
    expect(result.current.sessionTagFilters.size).toBe(0);
  });

  test("a late Undo does not filter on a tag that has already been deleted", () => {
    const { result } = setup({ phraseFilters: ["t1"] });

    act(() => result.current.handleDeleteTag("t1"));
    const undo = lastUndo();
    act(() => vi.advanceTimersByTime(5000));
    act(() => undo());

    expect(result.current.selectedTagFilters.size).toBe(0);
  });
});

describe("useUndoableDeletions — messages", () => {
  test("a lapsed message delete writes only to the provider", () => {
    const { result, deleteSessionMessage } = setup();

    act(() => result.current.handleDeleteMessage("s1", "m1"));
    expect(result.current.pendingMsgDeletions.has("m1")).toBe(true);

    act(() => vi.advanceTimersByTime(4000));

    expect(deleteSessionMessage).toHaveBeenCalledTimes(1);
    expect(deleteSessionMessage).toHaveBeenCalledWith("s1", "m1");
    expect(result.current.pendingMsgDeletions.size).toBe(0);
  });

  test("Undo keeps the message and cancels the provider write", () => {
    const { result, deleteSessionMessage } = setup();

    act(() => result.current.handleDeleteMessage("s1", "m1"));
    act(() => vi.advanceTimersByTime(1000));
    act(() => lastUndo()());

    expect(result.current.pendingMsgDeletions.size).toBe(0);

    act(() => vi.advanceTimersByTime(6000));
    expect(deleteSessionMessage).not.toHaveBeenCalled();
  });
});
