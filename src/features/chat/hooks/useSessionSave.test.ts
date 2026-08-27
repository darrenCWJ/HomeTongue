import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { Message, Tag } from "../../../types";
import { useSessionSave } from "./useSessionSave";

// Two bugs under test:
// CHAT-09 — the emptiness guard only ran in openSaveDialog, so New Chat behind
//   an open dialog let Save persist a ghost session with zero messages.
// CHAT-02 — a save did none of the cleanup New Chat does, so the previous
//   conversation's append window / chips / prefetched audio survived it. The
//   hook now calls back into ChatPage's shared reset after a successful save.

const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

const MESSAGES: Message[] = [{ id: "m1", sender: "user", text: "one kopi please" }];

const TAG: Tag = { id: "t1", name: "Hawker", type: "session", createdAt: "2026-01-01T00:00:00.000Z" };

function setup(messages: Message[] = MESSAGES) {
  const saveSession = vi.fn();
  const createTag = vi.fn(() => TAG);
  const onAfterSave = vi.fn();
  const { result, rerender } = renderHook(
    ({ msgs }: { msgs: Message[] }) =>
      useSessionSave({ messages: msgs, saveSession, createTag, onAfterSave }),
    { initialProps: { msgs: messages } }
  );
  return { result, rerender, saveSession, createTag, onAfterSave };
}

/** Open the dialog and fill in a title, as the user would before confirming. */
function openWithTitle(result: { current: ReturnType<typeof useSessionSave> }, title = "Kopi run") {
  act(() => result.current.openSaveDialog());
  act(() => result.current.setSaveTitle(title));
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("useSessionSave", () => {
  test("saves the conversation and closes the dialog", async () => {
    const { result, saveSession } = setup();
    openWithTitle(result);

    await act(async () => await result.current.confirmSave());

    expect(saveSession).toHaveBeenCalledWith(MESSAGES, "Kopi run", undefined);
    expect(result.current.isSaveDialogOpen).toBe(false);
    expect(mockToastSuccess).toHaveBeenCalledWith("Session saved!");
  });

  test("saving runs the conversation reset so no stale chat state survives", async () => {
    const { result, onAfterSave } = setup();
    openWithTitle(result);

    await act(async () => await result.current.confirmSave());

    expect(onAfterSave).toHaveBeenCalledTimes(1);
  });

  test("a failed save does not run the conversation reset", async () => {
    const { result, saveSession, onAfterSave } = setup();
    saveSession.mockImplementation(() => {
      throw new Error("db down");
    });
    openWithTitle(result);

    await act(async () => await result.current.confirmSave());

    expect(mockToastError).toHaveBeenCalledWith("Failed to save session.");
    expect(onAfterSave).not.toHaveBeenCalled();
  });

  test("confirming after the conversation was emptied saves nothing", async () => {
    const { result, rerender, saveSession, onAfterSave } = setup();
    openWithTitle(result);

    // New Chat behind the open dialog: the conversation is gone but the
    // dialog (and its typed title) is still on screen.
    rerender({ msgs: [] });
    await act(async () => await result.current.confirmSave());

    expect(saveSession).not.toHaveBeenCalled();
    expect(onAfterSave).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith("Nothing to save — the conversation is empty.");
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(result.current.isSaveDialogOpen).toBe(false);
  });
});
