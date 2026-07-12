import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from "vitest";
import type { Phrase } from "../../types";
import type { Repositories } from "../interfaces";
import { subscribeSyncEvents, type SyncEvent } from "../../lib/syncEvents";
import { createOutboxRepositories } from "./OutboxRepositories";
import { _resetOutboxForTests, flushOutbox, setOutboxHold, setOutboxUser } from "./outboxStore";
import type { OutboxEntry } from "./types";

// The invariants under test: a failed cloud write RESOLVES (the UI's
// optimistic update already happened) and lands durably in the outbox; the
// outbox flushes FIFO for the signed-in user only; a poison entry is dropped
// after exhausting its attempts instead of wedging the queue.

const USER_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_B = "bbbbbbbb-0000-0000-0000-000000000002";

// In-memory stand-in for the Dexie `outbox` table (jsdom has no IndexedDB).
const dbMocks = vi.hoisted(() => {
  const rows = new Map<string, { id: string; createdAt: number }>();
  const clone = <T>(value: T): T => structuredClone(value);
  return {
    rows,
    outbox: {
      add: async (entry: { id: string; createdAt: number }) => {
        if (rows.has(entry.id)) throw new Error(`duplicate id ${entry.id}`);
        rows.set(entry.id, clone(entry));
      },
      put: async (entry: { id: string; createdAt: number }) => {
        rows.set(entry.id, clone(entry));
      },
      delete: async (id: string) => {
        rows.delete(id);
      },
      orderBy: (key: "createdAt") => ({
        toArray: async () => [...rows.values()].sort((a, b) => a[key] - b[key]).map(clone),
      }),
    },
  };
});

vi.mock("../local/db", () => ({ db: { outbox: dbMocks.outbox } }));

// The decorator only reads the session user to tag entries; keep the session
// restore pending forever so tests control the user via setOutboxUser alone.
vi.mock("../../lib/authGateway", () => ({
  authGateway: {
    isEnabled: true,
    getSessionUser: () => new Promise(() => {}),
    onAuthUserChange: () => () => {},
    signInWithPassword: () => Promise.reject(new Error("unused in tests")),
    signUpWithPassword: () => Promise.reject(new Error("unused in tests")),
    signOut: () => Promise.reject(new Error("unused in tests")),
  },
}));

function createInner() {
  return {
    phrases: { getAll: vi.fn(async () => []), put: vi.fn(async () => {}), putMany: vi.fn(async () => {}) },
    conversations: {
      getAll: vi.fn(async () => []),
      addSession: vi.fn(async () => {}),
      updateSession: vi.fn(async () => {}),
      deleteSession: vi.fn(async () => {}),
    },
    user: { getProfile: vi.fn(async () => null), saveProfile: vi.fn(async () => {}) },
    lessons: { getAllProgress: vi.fn(async () => ({})), updateProgress: vi.fn(async () => {}) },
    conversationLessons: {
      getAll: vi.fn(async () => []),
      save: vi.fn(async () => {}),
      update: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
    },
    tags: { getAll: vi.fn(async () => []), create: vi.fn(async () => {}), delete: vi.fn(async () => {}) },
    reviewStates: {
      getAll: vi.fn(async () => []),
      put: vi.fn(async () => {}),
      putMany: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
    },
  };
}

function makePhrase(id: string, overrides: Partial<Phrase> = {}): Phrase {
  return {
    id,
    original: "Thank you",
    dialect: "唔該",
    pronunciation: "m4 goi1",
    isBookmarked: false,
    context: "",
    ...overrides,
  };
}

async function queuedEntries(): Promise<OutboxEntry[]> {
  return (await dbMocks.outbox.orderBy("createdAt").toArray()) as OutboxEntry[];
}

let events: SyncEvent[] = [];
let unsubscribe: () => void = () => {};
let errorSpy: MockInstance;

/** Signs a user in and settles the flush pass that the sign-in triggers. */
async function signIn(userId: string): Promise<void> {
  setOutboxUser(userId);
  await flushOutbox();
}

beforeEach(() => {
  _resetOutboxForTests();
  dbMocks.rows.clear();
  events = [];
  unsubscribe = subscribeSyncEvents((event) => {
    events.push(event);
  });
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  unsubscribe();
  errorSpy.mockRestore();
  _resetOutboxForTests();
});

describe("outbox decorator — write failures", () => {
  test("resolves a failed cloud write and queues it with the signed-in user's id", async () => {
    // Arrange
    const inner = createInner();
    inner.phrases.put.mockRejectedValueOnce(new Error("offline"));
    const repos: Repositories = createOutboxRepositories(inner);
    await signIn(USER_A);
    const phrase = makePhrase("phrase-1", { isBookmarked: true });

    // Act — must NOT reject even though the inner write failed
    await expect(repos.phrases.put(phrase)).resolves.toBeUndefined();

    // Assert
    const entries = await queuedEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      userId: USER_A,
      entity: "phrase",
      op: "put",
      payload: phrase,
      attempts: 0,
    });
    expect(events).toContainEqual({ type: "write-queued", entity: "phrase" });
  });

  test("passes successful writes through without queueing or events", async () => {
    // Arrange
    const inner = createInner();
    const repos: Repositories = createOutboxRepositories(inner);
    await signIn(USER_A);

    // Act
    await repos.tags.delete("tag-1");

    // Assert
    expect(inner.tags.delete).toHaveBeenCalledWith("tag-1");
    expect(await queuedEntries()).toHaveLength(0);
    expect(events.filter((e) => e.type === "write-queued")).toHaveLength(0);
  });

  test("hold mode queues writes without attempting the network at all", async () => {
    // Arrange
    const inner = createInner();
    const repos: Repositories = createOutboxRepositories(inner);
    await signIn(USER_A);
    setOutboxHold(true);

    // Act
    await repos.conversations.updateSession({ id: "session-1" } as never);

    // Assert
    expect(inner.conversations.updateSession).not.toHaveBeenCalled();
    const entries = await queuedEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ entity: "session", op: "put" });
  });

  test("drops (does not queue) a failed write when nobody is signed in", async () => {
    // Arrange
    const inner = createInner();
    inner.phrases.put.mockRejectedValueOnce(new Error("Sign in to sync your data."));
    const repos: Repositories = createOutboxRepositories(inner);
    // no setOutboxUser call — the write cannot be attributed

    // Act
    await expect(repos.phrases.put(makePhrase("phrase-2"))).resolves.toBeUndefined();

    // Assert
    expect(await queuedEntries()).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("no signed-in user"));
  });
});

describe("outbox flush", () => {
  test("replays queued entries FIFO, empties the queue and emits flush-complete", async () => {
    // Arrange — two writes fail while offline, then connectivity returns
    const inner = createInner();
    inner.phrases.put.mockRejectedValueOnce(new Error("offline"));
    inner.conversations.deleteSession.mockRejectedValueOnce(new Error("offline"));
    const repos: Repositories = createOutboxRepositories(inner);
    await signIn(USER_A);
    const phrase = makePhrase("phrase-3");
    await repos.phrases.put(phrase);
    await repos.conversations.deleteSession("session-9");
    expect(await queuedEntries()).toHaveLength(2);

    // Act
    await flushOutbox();

    // Assert — replayed in enqueue order against the inner repos
    expect(inner.phrases.put).toHaveBeenNthCalledWith(2, phrase);
    expect(inner.conversations.deleteSession).toHaveBeenNthCalledWith(2, "session-9");
    expect(inner.phrases.put.mock.invocationCallOrder[1]).toBeLessThan(
      inner.conversations.deleteSession.mock.invocationCallOrder[1]
    );
    expect(await queuedEntries()).toHaveLength(0);
    expect(events).toContainEqual({ type: "flush-complete", flushedCount: 2 });
  });

  test("only flushes the current user's entries; other users' entries are held", async () => {
    // Arrange — user A queues a write, then user B signs in
    const inner = createInner();
    inner.phrases.put.mockRejectedValueOnce(new Error("offline"));
    const repos: Repositories = createOutboxRepositories(inner);
    await signIn(USER_A);
    await repos.phrases.put(makePhrase("phrase-4"));
    await signIn(USER_B);

    // Act — B's flush must not touch A's entry
    await flushOutbox();

    // Assert
    expect(await queuedEntries()).toHaveLength(1);
    expect((await queuedEntries())[0].userId).toBe(USER_A);
    expect(inner.phrases.put).toHaveBeenCalledTimes(1); // only the original failed attempt

    // Act — A signs back in; their held entry flushes
    await signIn(USER_A);
    await flushOutbox();

    // Assert
    expect(await queuedEntries()).toHaveLength(0);
    expect(inner.phrases.put).toHaveBeenCalledTimes(2);
  });

  test("a retryable failure increments attempts and blocks later entries (FIFO preserved)", async () => {
    // Arrange — two queued writes; the first keeps failing on replay
    const inner = createInner();
    inner.phrases.put.mockRejectedValue(new Error("still offline"));
    inner.tags.create.mockRejectedValueOnce(new Error("still offline"));
    const repos: Repositories = createOutboxRepositories(inner);
    await signIn(USER_A);
    await repos.phrases.put(makePhrase("phrase-5"));
    await repos.tags.create({ id: "tag-9", name: "New", type: "phrase", createdAt: "2026-01-01" });
    inner.tags.create.mockClear();

    // Act
    await flushOutbox();

    // Assert — first entry gained an attempt, second was never attempted
    const entries = await queuedEntries();
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ entity: "phrase", attempts: 1 });
    expect(entries[1]).toMatchObject({ entity: "tag", attempts: 0 });
    expect(inner.tags.create).not.toHaveBeenCalled();
  });

  test("drops an entry with an entry-dropped event after 8 failed replays", async () => {
    // Arrange
    const inner = createInner();
    inner.phrases.put.mockRejectedValue(new Error("RLS violation"));
    const repos: Repositories = createOutboxRepositories(inner);
    await signIn(USER_A);
    await repos.phrases.put(makePhrase("phrase-6"));

    // Act — 8 flush passes exhaust the entry's attempts
    for (let pass = 0; pass < 8; pass++) {
      await flushOutbox();
    }

    // Assert
    expect(await queuedEntries()).toHaveLength(0);
    expect(events).toContainEqual({ type: "entry-dropped", entity: "phrase", op: "put" });
    expect(events.filter((e) => e.type === "flush-complete")).toHaveLength(0);
  });

  test("clearing hold mode flushes what accumulated while held", async () => {
    // Arrange — writes issued while held (e.g. initial load failed)
    const inner = createInner();
    const repos: Repositories = createOutboxRepositories(inner);
    await signIn(USER_A);
    setOutboxHold(true);
    const phrase = makePhrase("phrase-7");
    await repos.phrases.put(phrase);
    expect(inner.phrases.put).not.toHaveBeenCalled();

    // Act — successful reload clears the hold, which triggers the flush
    setOutboxHold(false);
    await flushOutbox(); // joins/settles the triggered pass

    // Assert
    expect(inner.phrases.put).toHaveBeenCalledWith(phrase);
    expect(await queuedEntries()).toHaveLength(0);
  });
});
