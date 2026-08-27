import "@testing-library/jest-dom/vitest";
import { StrictMode } from "react";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render } from "@testing-library/react";
import { subscribeSyncEvents, type SyncEvent } from "../../lib/syncEvents";
import { LibraryProvider } from "./LibraryProvider";

// The gap under test (cross-cutting, local mode): when the initial repository
// load rejects, the provider keeps the UI fully usable but stops writing —
// every change is silently lost on reload. Nothing surfaced that. The provider
// must now announce it once so the UI can hold a banner up for the session.

const mocks = vi.hoisted(() => ({ loadShouldFail: true }));

const failing = () => Promise.reject(new Error("IndexedDB unavailable"));

vi.mock("../../repositories", () => ({
  isCloudStorageMode: false,
  setCloudWriteHold: vi.fn(),
  repositories: {
    phrases: { getAll: () => (mocks.loadShouldFail ? failing() : Promise.resolve([])) },
    conversations: { getAll: () => Promise.resolve([]) },
    lessons: { getAllProgress: () => Promise.resolve({}) },
    conversationLessons: { getAll: () => Promise.resolve([]) },
    tags: { getAll: () => Promise.resolve([]) },
  },
}));

vi.mock("./AuthProvider", () => ({
  useAuth: () => ({ authEpoch: 0 }),
}));

// The toast mapping is covered in src/lib/useSyncToasts.test.tsx; this file
// asserts only what the provider puts on the event channel.
vi.mock("../../lib/useSyncToasts", () => ({
  useSyncToasts: () => {},
}));

let events: SyncEvent[] = [];
let unsubscribe: () => void = () => {};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.loadShouldFail = true;
  events = [];
  unsubscribe = subscribeSyncEvents((event) => events.push(event));
});

afterEach(() => {
  unsubscribe();
  vi.restoreAllMocks();
});

const persistenceDisabled = () => events.filter((e) => e.type === "persistence-disabled");

describe("LibraryProvider degraded-persistence signal (local mode)", () => {
  test("announces persistence-disabled when the initial load fails", async () => {
    // Arrange + Act
    render(
      <LibraryProvider>
        <div />
      </LibraryProvider>
    );
    await act(async () => {});

    // Assert
    expect(persistenceDisabled()).toHaveLength(1);
  });

  test("stays silent when the initial load succeeds", async () => {
    // Arrange
    mocks.loadShouldFail = false;

    // Act
    render(
      <LibraryProvider>
        <div />
      </LibraryProvider>
    );
    await act(async () => {});

    // Assert
    expect(persistenceDisabled()).toHaveLength(0);
  });

  test("announces once per provider, not once per load pass", async () => {
    // Arrange + Act — StrictMode re-runs mount effects, so the load (and its
    // rejection) happens twice against one provider instance.
    render(
      <StrictMode>
        <LibraryProvider>
          <div />
        </LibraryProvider>
      </StrictMode>
    );
    await act(async () => {});

    // Assert — one banner for the session, not one per failed pass
    expect(persistenceDisabled()).toHaveLength(1);
  });
});
