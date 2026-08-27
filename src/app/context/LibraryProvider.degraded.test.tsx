import "@testing-library/jest-dom/vitest";
import { StrictMode } from "react";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Phrase } from "../../types";
import { subscribeSyncEvents, type SyncEvent } from "../../lib/syncEvents";
import { LibraryProvider, useLibrary } from "./LibraryProvider";

// The gap under test (cross-cutting): when the initial repository load
// rejects, the provider keeps the UI fully usable but the changes have
// nowhere durable to go — every one is silently lost on reload. The provider
// must announce that once (the persistent banner) and stop firing writes at
// the store that just failed.
//
// WHO that applies to is the point of this file: not "local builds" but every
// session whose writes the session router (src/repositories/routing.ts) sends
// to local Dexie — local mode always, AND a guest in a cloud build. Only a
// signed-in cloud session is exempt: its writes go through the outbox, which
// the failed load put in hold mode, so they are captured durably. The build
// flag (isCloudStorageMode) cannot tell a guest from a signed-in user, which
// is exactly the bug that let a cloud-build guest lose work in silence.

const mocks = vi.hoisted(() => ({
  loadShouldFail: true,
  cloudStorageMode: false,
  sessionRoutedToCloud: false,
}));

const failing = () => Promise.reject(new Error("IndexedDB unavailable"));

const putPhraseSpy = vi.fn((phrase: Phrase) => Promise.resolve(phrase));

vi.mock("../../repositories", () => ({
  // Getters/thunks, not literals: each test picks its own build mode and
  // session routing, and the provider reads both on every pass.
  get isCloudStorageMode() {
    return mocks.cloudStorageMode;
  },
  isSessionRoutedToCloud: () => mocks.sessionRoutedToCloud,
  setCloudWriteHold: vi.fn(),
  repositories: {
    phrases: {
      getAll: () => (mocks.loadShouldFail ? failing() : Promise.resolve([])),
      put: (phrase: Phrase) => putPhraseSpy(phrase),
    },
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

const NEW_PHRASE: Phrase = {
  id: "written-phrase",
  original: "thanks",
  dialect: "唔該",
  pronunciation: "",
  isBookmarked: true,
  context: "",
};

/** Lets a test drive one library mutation, to see whether `persist` runs it. */
function WriteProbe() {
  const { addPhrase } = useLibrary();
  return <button onClick={() => addPhrase(NEW_PHRASE)}>add phrase</button>;
}

const addPhraseViaUi = () => fireEvent.click(screen.getByRole("button", { name: "add phrase" }));

let events: SyncEvent[] = [];
let unsubscribe: () => void = () => {};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.loadShouldFail = true;
  mocks.cloudStorageMode = false;
  mocks.sessionRoutedToCloud = false;
  events = [];
  unsubscribe = subscribeSyncEvents((event) => events.push(event));
});

// Vitest runs without `globals: true`, so RTL's automatic cleanup never
// registers — unmount explicitly or the previous test's tree (and its
// "add phrase" button) stays mounted.
afterEach(() => {
  cleanup();
  unsubscribe();
  vi.restoreAllMocks();
});

const persistenceDisabled = () => events.filter((e) => e.type === "persistence-disabled");

const renderProvider = (children: React.ReactNode = <div />) =>
  render(<LibraryProvider>{children}</LibraryProvider>);

describe("LibraryProvider degraded-persistence signal (local mode)", () => {
  test("announces persistence-disabled when the initial load fails", async () => {
    // Arrange + Act
    renderProvider();
    await act(async () => {});

    // Assert
    expect(persistenceDisabled()).toHaveLength(1);
  });

  test("stays silent when the initial load succeeds", async () => {
    // Arrange
    mocks.loadShouldFail = false;

    // Act
    renderProvider();
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

  test("skips writes after the failed load — the change stays in memory only", async () => {
    // Arrange
    renderProvider(<WriteProbe />);
    await act(async () => {});

    // Act
    addPhraseViaUi();

    // Assert — never fire a write from an unhydrated state at the store
    expect(putPhraseSpy).not.toHaveBeenCalled();
  });
});

describe("LibraryProvider degraded-persistence signal (cloud build, guest session)", () => {
  // A guest in a cloud build: the build flag says cloud, but the session
  // router sends every call to local Dexie and their writes never reach the
  // outbox — so a failed load must be treated exactly like local mode.
  beforeEach(() => {
    mocks.cloudStorageMode = true;
    mocks.sessionRoutedToCloud = false;
  });

  test("announces persistence-disabled when the guest's local load fails", async () => {
    // Arrange + Act
    renderProvider();
    await act(async () => {});

    // Assert — the banner must not be suppressed by the build-mode flag
    expect(persistenceDisabled()).toHaveLength(1);
  });

  test("skips writes after the failed load instead of firing them at the broken store", async () => {
    // Arrange
    renderProvider(<WriteProbe />);
    await act(async () => {});

    // Act
    addPhraseViaUi();

    // Assert — no outbox behind these writes, so they must not run and fail
    expect(putPhraseSpy).not.toHaveBeenCalled();
  });

  test("stays silent and writes normally when the guest's load succeeds", async () => {
    // Arrange
    mocks.loadShouldFail = false;

    // Act
    renderProvider(<WriteProbe />);
    await act(async () => {});
    addPhraseViaUi();

    // Assert — a healthy guest session keeps full local persistence
    expect(persistenceDisabled()).toHaveLength(0);
    expect(putPhraseSpy).toHaveBeenCalledWith(expect.objectContaining({ id: NEW_PHRASE.id }));
  });
});

describe("LibraryProvider degraded-persistence signal (cloud build, signed-in session)", () => {
  // Signed in, the session router sends writes to the outbox-backed cloud
  // set: the failed load put the outbox in hold mode, so writes are captured
  // durably and their own toasts tell the story — no banner, no skipping.
  beforeEach(() => {
    mocks.cloudStorageMode = true;
    mocks.sessionRoutedToCloud = true;
  });

  test("does not announce on a failed load — the outbox holds writes durably", async () => {
    // Arrange + Act
    renderProvider();
    await act(async () => {});

    // Assert
    expect(persistenceDisabled()).toHaveLength(0);
  });

  test("keeps writes flowing after a failed load so the held outbox captures them", async () => {
    // Arrange
    renderProvider(<WriteProbe />);
    await act(async () => {});

    // Act
    addPhraseViaUi();

    // Assert
    expect(putPhraseSpy).toHaveBeenCalledWith(expect.objectContaining({ id: NEW_PHRASE.id }));
  });
});
