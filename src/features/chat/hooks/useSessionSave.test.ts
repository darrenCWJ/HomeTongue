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

// CHAT-12 — openSaveDialog left isCreatingSessionTag/newSessionTagInput from
// a previous, cancelled dialog session live. Reopening later and confirming
// without touching the tag input silently auto-committed that stale typed
// text as a brand-new tag on an unrelated session. Appending the created
// tag's id must also dedupe against an already-selected tag with that id.
describe("useSessionSave dialog-open reset and tag dedupe (CHAT-12)", () => {
  test("openSaveDialog resets a stale creating-tag flag and its typed input", () => {
    const { result } = setup();
    act(() => result.current.openSaveDialog());
    act(() => result.current.setIsCreatingSessionTag(true));
    act(() => result.current.setNewSessionTagInput("Half-typed"));
    act(() => result.current.setIsSaveDialogOpen(false)); // Cancel, as the dialog's own close would

    act(() => result.current.openSaveDialog());

    expect(result.current.isCreatingSessionTag).toBe(false);
    expect(result.current.newSessionTagInput).toBe("");
  });

  test("a stale creating-tag flag left from a previous session cannot auto-commit on the next save", async () => {
    const { result, saveSession, createTag } = setup();
    act(() => result.current.openSaveDialog());
    act(() => result.current.setIsCreatingSessionTag(true));
    act(() => result.current.setNewSessionTagInput("Half-typed"));
    act(() => result.current.setIsSaveDialogOpen(false));

    openWithTitle(result, "Later run");
    await act(async () => await result.current.confirmSave());

    expect(createTag).not.toHaveBeenCalled();
    expect(saveSession).toHaveBeenCalledWith(MESSAGES, "Later run", undefined);
  });

  test("the created tag id is deduped against an already-selected tag", async () => {
    const { result, saveSession } = setup();
    openWithTitle(result);
    act(() => result.current.setSaveSessionTags([TAG.id]));
    act(() => result.current.setIsCreatingSessionTag(true));
    act(() => result.current.setNewSessionTagInput("Hawker"));

    await act(async () => await result.current.confirmSave());

    expect(saveSession).toHaveBeenCalledWith(MESSAGES, "Kopi run", [TAG.id]);
  });
});

// Folded item A — onAfterSave (ChatPage's conversation reset) ran inside the
// same try/catch as the save itself, so a throwing reset was caught as if
// the save had failed: it toasted "Failed to save session" over a save that
// actually succeeded, and re-ran the already-done dialog close.
//
// Coordinator round-2 MINOR — moving the call outside confirmSave's own
// try/catch meant a throwing onAfterSave now escaped confirmSave itself as
// a rejection, and confirmSave's only caller is a bare onClick (no one
// awaits or catches it) — an unhandled rejection. It is now wrapped in its
// own try/catch that logs instead: the save already succeeded, so there is
// nothing to tell the user beyond what the success toast already said.
describe("useSessionSave onAfterSave failure isolation (folded item A)", () => {
  test("a throwing reset does not trigger the failure toast for a save that succeeded", async () => {
    const { result, onAfterSave } = setup();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    onAfterSave.mockImplementation(() => {
      throw new Error("reset blew up");
    });
    openWithTitle(result);

    await act(async () => await result.current.confirmSave());

    expect(mockToastSuccess).toHaveBeenCalledWith("Session saved!");
    expect(mockToastError).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  test("a throwing reset is logged instead of escaping confirmSave as an unhandled rejection", async () => {
    const { result, onAfterSave } = setup();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const resetError = new Error("reset blew up");
    onAfterSave.mockImplementation(() => {
      throw resetError;
    });
    openWithTitle(result);

    // Must not reject — confirmSave's only caller is a bare onClick with no
    // catch of its own.
    await expect(act(async () => await result.current.confirmSave())).resolves.not.toThrow();

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.any(String), resetError);
    consoleErrorSpy.mockRestore();
  });

  test("a throwing reset still leaves the dialog closed and isSaving settled from the successful save", async () => {
    const { result, onAfterSave } = setup();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    onAfterSave.mockImplementation(() => {
      throw new Error("reset blew up");
    });
    openWithTitle(result);

    await act(async () => await result.current.confirmSave());

    // The save's own try/catch/finally already ran and settled these before
    // onAfterSave was ever called — its throw must not re-run or undo them.
    expect(result.current.isSaveDialogOpen).toBe(false);
    expect(result.current.isSaving).toBe(false);
    consoleErrorSpy.mockRestore();
  });
});
