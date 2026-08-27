import "@testing-library/jest-dom/vitest";
import { describe, test, expect, vi, beforeEach } from "vitest";
import { act, render } from "@testing-library/react";
import { emitSyncEvent } from "./syncEvents";
import { useSyncToasts } from "./useSyncToasts";

// The gap under test: a LOCAL-mode user whose IndexedDB load failed keeps a
// fully usable UI while every change is dropped on reload. Nothing told them.
// `persistence-disabled` is the event that says so, and it must map to a toast
// that STAYS on screen (the condition lasts the whole session) and cannot
// stack (id-deduped), unlike the transient cloud-outbox toasts.

const toastError = vi.fn();
const toastInfo = vi.fn();
const toastSuccess = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    info: (...args: unknown[]) => toastInfo(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

function ToastProbe() {
  useSyncToasts();
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useSyncToasts persistence-disabled mapping", () => {
  test("shows a persistent, id-deduped error toast", () => {
    // Arrange
    render(<ToastProbe />);

    // Act
    act(() => emitSyncEvent({ type: "persistence-disabled" }));

    // Assert
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledWith(
      "Storage isn't available — changes won't be saved on this device.",
      expect.objectContaining({ duration: Infinity, id: expect.any(String) })
    );
  });

  test("a repeat emit reuses the same toast id so it replaces rather than stacks", () => {
    // Arrange
    render(<ToastProbe />);

    // Act — e.g. a second subscriber mounting, or a re-emit after a retry
    act(() => emitSyncEvent({ type: "persistence-disabled" }));
    act(() => emitSyncEvent({ type: "persistence-disabled" }));

    // Assert
    expect(toastError).toHaveBeenCalledTimes(2);
    const [, firstOptions] = toastError.mock.calls[0] as [string, { id: string }];
    const [, secondOptions] = toastError.mock.calls[1] as [string, { id: string }];
    expect(secondOptions.id).toBe(firstOptions.id);
  });

  test("leaves the cloud outbox toasts unchanged", () => {
    // Arrange
    render(<ToastProbe />);

    // Act
    act(() => emitSyncEvent({ type: "write-queued", entity: "phrases" }));
    act(() => emitSyncEvent({ type: "flush-complete", flushedCount: 3 }));
    act(() => emitSyncEvent({ type: "entry-dropped", entity: "phrases", op: "put" }));

    // Assert — transient toasts, no persistence options bolted on
    expect(toastInfo).toHaveBeenCalledWith("Saved on this device — will sync when back online");
    expect(toastSuccess).toHaveBeenCalledWith("Synced");
    expect(toastError).toHaveBeenCalledWith("A change could not be synced and was discarded.");
  });
});
