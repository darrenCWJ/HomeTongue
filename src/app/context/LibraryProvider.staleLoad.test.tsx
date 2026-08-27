import "@testing-library/jest-dom/vitest";
import { StrictMode } from "react";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ConversationLesson, LessonProgress, Phrase, Session, Tag } from "../../types";
import { LibraryProvider, useLibrary } from "./LibraryProvider";

// The bug under test: the load effect re-runs on `reloadEpoch`, but its `.then`
// / `.catch` wrote every state slice unconditionally — no cancellation fence.
// Reachable since guest routing landed: on a cold start in a cloud build the
// epoch-0 guest load reads local Dexie, which can still be opening (a slow
// Capacitor webview) when the user's sign-in bumps the epoch and the epoch-1
// cloud load resolves first. The guest snapshot then lands last and replaces
// the signed-in library in memory — the user sees guest data, and their next
// edit persists those guest rows into their own cloud account.
// The fence mirrors ProfileProvider's (`let cancelled` + cleanup).

interface LoadPayload {
  phrases: Phrase[];
  sessions: Session[];
  lessonProgress: Record<string, LessonProgress>;
  conversationLessons: ConversationLesson[];
  tags: Tag[];
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function payload(marker: string): LoadPayload {
  return {
    phrases: [
      {
        id: `${marker}-phrase`,
        original: "good morning",
        dialect: "早晨",
        pronunciation: "",
        isBookmarked: true,
        context: "",
      },
    ],
    sessions: [{ id: `${marker}-session`, date: "2026-01-01", messages: [] }],
    lessonProgress: {
      [`${marker}-lesson`]: {
        lessonId: `${marker}-lesson`,
        completedLevels: 1,
        totalLevels: 3,
        lastAccessedAt: "2026-01-01T00:00:00.000Z",
      },
    },
    conversationLessons: [
      {
        id: `${marker}-conversation`,
        sessionId: `${marker}-session`,
        title: "Ordering kopi",
        createdAt: "2026-01-01T00:00:00.000Z",
        vocabulary: [],
        examCompleted: false,
        examAttempts: 0,
      },
    ],
    tags: [{ id: `${marker}-tag`, name: "Greetings", type: "phrase", createdAt: "2026-01-01T00:00:00.000Z" }],
  };
}

/** The guest/local snapshot that loses the race but settles last. */
const GUEST = payload("guest");
/** The signed-in cloud snapshot that must survive. */
const SIGNED_IN = payload("cloud");

const NEW_PHRASE: Phrase = {
  id: "written-phrase",
  original: "thanks",
  dialect: "唔該",
  pronunciation: "",
  isBookmarked: true,
  context: "",
};

const mocks = vi.hoisted(() => ({ isCloudStorageMode: true }));

// The five repository reads run in ONE Promise.all, so the first call of a run
// allocates that run's deferred and the other four read it back — one handle
// per load run, which is exactly what a test needs to settle them out of order.
const loads: Deferred<LoadPayload>[] = [];
let currentLoad: Deferred<LoadPayload> | null = null;

function beginLoad(): Deferred<LoadPayload> {
  currentLoad = deferred<LoadPayload>();
  loads.push(currentLoad);
  return currentLoad;
}

function activeLoad(): Deferred<LoadPayload> {
  if (!currentLoad) throw new Error("no load run in flight");
  return currentLoad;
}

const setCloudWriteHoldSpy = vi.fn();
const putPhraseSpy = vi.fn((phrase: Phrase) => Promise.resolve(phrase));

vi.mock("../../repositories", () => ({
  // A getter, not a literal: one test drives the LOCAL-mode branch of the
  // same effect, and the provider reads this flag on every render.
  get isCloudStorageMode() {
    return mocks.isCloudStorageMode;
  },
  setCloudWriteHold: (hold: boolean) => setCloudWriteHoldSpy(hold),
  repositories: {
    phrases: {
      getAll: () => beginLoad().promise.then((p) => p.phrases),
      put: (phrase: Phrase) => putPhraseSpy(phrase),
    },
    conversations: { getAll: () => activeLoad().promise.then((p) => p.sessions) },
    lessons: { getAllProgress: () => activeLoad().promise.then((p) => p.lessonProgress) },
    conversationLessons: { getAll: () => activeLoad().promise.then((p) => p.conversationLessons) },
    tags: { getAll: () => activeLoad().promise.then((p) => p.tags) },
  },
}));

let authEpoch = 0;

vi.mock("./AuthProvider", () => ({
  useAuth: () => ({ authEpoch }),
}));

vi.mock("../../lib/useSyncToasts", () => ({
  useSyncToasts: () => {},
}));

function LibraryProbe() {
  const { phrases, sessions, lessonProgress, conversationLessons, tags, addPhrase } = useLibrary();
  return (
    <div>
      <span data-testid="phrases">{phrases.map((p) => p.id).join(",") || "(none)"}</span>
      <span data-testid="sessions">{sessions.map((s) => s.id).join(",") || "(none)"}</span>
      <span data-testid="progress">{Object.keys(lessonProgress).join(",") || "(none)"}</span>
      <span data-testid="lessons">{conversationLessons.map((l) => l.id).join(",") || "(none)"}</span>
      <span data-testid="tags">{tags.map((t) => t.id).join(",") || "(none)"}</span>
      <button onClick={() => addPhrase(NEW_PHRASE)}>add phrase</button>
    </div>
  );
}

// A fresh element every call: React bails out of re-rendering when handed the
// identical element reference, so a reused constant would never re-run the
// load effect on an epoch change.
const tree = () => (
  <LibraryProvider>
    <LibraryProbe />
  </LibraryProvider>
);

const slice = (id: string) => screen.getByTestId(id);
const click = (label: string) => fireEvent.click(screen.getByRole("button", { name: label }));

/** Every slice of the loaded library, so a partial overwrite cannot hide. */
function expectLibraryOf(marker: string) {
  expect(slice("phrases")).toHaveTextContent(`${marker}-phrase`);
  expect(slice("sessions")).toHaveTextContent(`${marker}-session`);
  expect(slice("progress")).toHaveTextContent(`${marker}-lesson`);
  expect(slice("lessons")).toHaveTextContent(`${marker}-conversation`);
  expect(slice("tags")).toHaveTextContent(`${marker}-tag`);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.isCloudStorageMode = true;
  authEpoch = 0;
  loads.length = 0;
  currentLoad = null;
});

// Vitest runs without `globals: true`, so RTL's automatic cleanup never
// registers — unmount explicitly or the previous tree stays mounted.
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("LibraryProvider stale-load fence", () => {
  test("a stale guest load cannot overwrite the signed-in library that beat it", async () => {
    // Arrange — cold start as a guest: the local Dexie read is still in flight
    const { rerender } = render(tree());
    expect(loads).toHaveLength(1);

    // Act — the user signs in mid-load; the new epoch's cloud read lands first
    authEpoch = 1;
    rerender(tree());
    expect(loads).toHaveLength(2);
    await act(async () => {
      loads[1].resolve(SIGNED_IN);
    });
    expectLibraryOf("cloud");

    // ...then the abandoned guest read finally settles
    await act(async () => {
      loads[0].resolve(GUEST);
    });

    // Assert — the user must not be left looking at guest data inside their
    // own account, where the next edit would persist those rows into it
    expectLibraryOf("cloud");
  });

  test("a stale run that fails does not put cloud writes back on hold", async () => {
    // Arrange — the signed-in load has already hydrated and released the hold
    const { rerender } = render(tree());
    authEpoch = 1;
    rerender(tree());
    await act(async () => {
      loads[1].resolve(SIGNED_IN);
    });
    expect(setCloudWriteHoldSpy).toHaveBeenLastCalledWith(false);

    // Act — the abandoned guest read rejects afterwards
    await act(async () => {
      loads[0].reject(new Error("IndexedDB unavailable"));
    });

    // Assert — a dead run must not re-hold writes for the live session
    expect(setCloudWriteHoldSpy).not.toHaveBeenCalledWith(true);
    expect(setCloudWriteHoldSpy).toHaveBeenLastCalledWith(false);
    expectLibraryOf("cloud");
  });

  test("a stale run that fails does not disable persistence for the run that succeeded", async () => {
    // Arrange — local mode, where a failed load makes `persist` skip writes
    // entirely. StrictMode gives two runs against one provider: the first is
    // abandoned by the effect cleanup, the second is the live one.
    mocks.isCloudStorageMode = false;
    render(<StrictMode>{tree()}</StrictMode>);
    expect(loads).toHaveLength(2);
    await act(async () => {
      loads[1].resolve(SIGNED_IN);
    });
    await act(async () => {
      loads[0].reject(new Error("IndexedDB unavailable"));
    });

    // Act
    click("add phrase");

    // Assert — the live run hydrated, so writes must still reach the store
    expect(putPhraseSpy).toHaveBeenCalledWith(expect.objectContaining({ id: NEW_PHRASE.id }));
  });
});
