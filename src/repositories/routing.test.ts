import { describe, expect, test, vi, type MockInstance } from "vitest";
import type {
  ConversationLesson,
  LessonProgress,
  Phrase,
  PhraseReviewState,
  Session,
  Tag,
  UserProfile,
} from "../types";
import type { Repositories } from "./interfaces";
import { createSessionRoutedRepositories } from "./routing";

// The invariant under test: in cloud builds a guest (no Supabase session) must
// reach the LOCAL repositories — "Guest data stays on this device" — while a
// signed-in user reaches the cloud set, and the choice is re-made on EVERY
// call because the session arrives asynchronously and changes over time.

const PHRASE: Phrase = {
  id: "phrase-1",
  original: "Thank you",
  dialect: "唔該",
  pronunciation: "m4 goi1",
  isBookmarked: false,
  context: "",
};

const SESSION: Session = { id: "session-1", date: "27 Aug 2026", messages: [] };

const PROFILE: UserProfile = {
  id: "singleton",
  name: "Guest",
  preferredDialect: "yue-HK",
  preferredTone: "casual",
  toneOverrideEnabled: false,
  personalityNotes: "",
  conversationCount: 0,
  createdAt: "2026-08-27T00:00:00.000Z",
  updatedAt: "2026-08-27T00:00:00.000Z",
};

const PROGRESS: LessonProgress = {
  lessonId: "lesson-1",
  completedLevels: 1,
  totalLevels: 4,
  lastAccessedAt: "2026-08-27T00:00:00.000Z",
};

const CONVERSATION_LESSON: ConversationLesson = {
  id: "lesson-a",
  sessionId: "session-1",
  title: "Ordering kopi",
  createdAt: "2026-08-27T00:00:00.000Z",
  vocabulary: [],
  examCompleted: false,
  examAttempts: 0,
};

const TAG: Tag = { id: "tag-1", name: "Food", type: "phrase", createdAt: "2026-08-27" };

const REVIEW_STATE: PhraseReviewState = {
  phraseId: "phrase-1",
  due: "2026-08-28T00:00:00.000Z",
  intervalDays: 0,
  ease: 2.5,
  reps: 0,
  lapses: 0,
  updatedAt: "2026-08-27T00:00:00.000Z",
};

/** Interface-shaped stand-ins for one repository set; every method is a spy. */
function createFakeRepositories() {
  return {
    phrases: {
      getAll: vi.fn(async (): Promise<Phrase[]> => []),
      put: vi.fn(async (_phrase: Phrase): Promise<void> => {}),
      putMany: vi.fn(async (_phrases: Phrase[]): Promise<void> => {}),
    },
    conversations: {
      getAll: vi.fn(async (): Promise<Session[]> => []),
      addSession: vi.fn(async (_session: Session): Promise<void> => {}),
      updateSession: vi.fn(async (_session: Session): Promise<void> => {}),
      deleteSession: vi.fn(async (_id: string): Promise<void> => {}),
    },
    user: {
      getProfile: vi.fn(async (): Promise<UserProfile | null> => null),
      saveProfile: vi.fn(async (_profile: UserProfile): Promise<void> => {}),
    },
    lessons: {
      getAllProgress: vi.fn(async (): Promise<Record<string, LessonProgress>> => ({})),
      updateProgress: vi.fn(async (_progress: LessonProgress): Promise<void> => {}),
    },
    conversationLessons: {
      getAll: vi.fn(async (): Promise<ConversationLesson[]> => []),
      save: vi.fn(async (_lesson: ConversationLesson): Promise<void> => {}),
      update: vi.fn(async (_lesson: ConversationLesson): Promise<void> => {}),
      delete: vi.fn(async (_id: string): Promise<void> => {}),
    },
    tags: {
      getAll: vi.fn(async (): Promise<Tag[]> => []),
      create: vi.fn(async (_tag: Tag): Promise<void> => {}),
      delete: vi.fn(async (_id: string): Promise<void> => {}),
    },
    reviewStates: {
      getAll: vi.fn(async (): Promise<PhraseReviewState[]> => []),
      put: vi.fn(async (_state: PhraseReviewState): Promise<void> => {}),
      putMany: vi.fn(async (_states: PhraseReviewState[]): Promise<void> => {}),
      delete: vi.fn(async (_phraseId: string): Promise<void> => {}),
    },
  };
}

type FakeRepositories = ReturnType<typeof createFakeRepositories>;

interface RoutedCall {
  readonly label: string;
  readonly invoke: (repos: Repositories) => Promise<unknown>;
  readonly target: (repos: FakeRepositories) => MockInstance;
}

/** Every method of all seven repositories, with the delegate it must land on. */
const REPOSITORY_CALLS: readonly RoutedCall[] = [
  { label: "phrases.getAll", invoke: (r) => r.phrases.getAll(), target: (f) => f.phrases.getAll },
  { label: "phrases.put", invoke: (r) => r.phrases.put(PHRASE), target: (f) => f.phrases.put },
  { label: "phrases.putMany", invoke: (r) => r.phrases.putMany([PHRASE]), target: (f) => f.phrases.putMany },
  {
    label: "conversations.getAll",
    invoke: (r) => r.conversations.getAll(),
    target: (f) => f.conversations.getAll,
  },
  {
    label: "conversations.addSession",
    invoke: (r) => r.conversations.addSession(SESSION),
    target: (f) => f.conversations.addSession,
  },
  {
    label: "conversations.updateSession",
    invoke: (r) => r.conversations.updateSession(SESSION),
    target: (f) => f.conversations.updateSession,
  },
  {
    label: "conversations.deleteSession",
    invoke: (r) => r.conversations.deleteSession(SESSION.id),
    target: (f) => f.conversations.deleteSession,
  },
  { label: "user.getProfile", invoke: (r) => r.user.getProfile(), target: (f) => f.user.getProfile },
  {
    label: "user.saveProfile",
    invoke: (r) => r.user.saveProfile(PROFILE),
    target: (f) => f.user.saveProfile,
  },
  {
    label: "lessons.getAllProgress",
    invoke: (r) => r.lessons.getAllProgress(),
    target: (f) => f.lessons.getAllProgress,
  },
  {
    label: "lessons.updateProgress",
    invoke: (r) => r.lessons.updateProgress(PROGRESS),
    target: (f) => f.lessons.updateProgress,
  },
  {
    label: "conversationLessons.getAll",
    invoke: (r) => r.conversationLessons.getAll(),
    target: (f) => f.conversationLessons.getAll,
  },
  {
    label: "conversationLessons.save",
    invoke: (r) => r.conversationLessons.save(CONVERSATION_LESSON),
    target: (f) => f.conversationLessons.save,
  },
  {
    label: "conversationLessons.update",
    invoke: (r) => r.conversationLessons.update(CONVERSATION_LESSON),
    target: (f) => f.conversationLessons.update,
  },
  {
    label: "conversationLessons.delete",
    invoke: (r) => r.conversationLessons.delete(CONVERSATION_LESSON.id),
    target: (f) => f.conversationLessons.delete,
  },
  { label: "tags.getAll", invoke: (r) => r.tags.getAll(), target: (f) => f.tags.getAll },
  { label: "tags.create", invoke: (r) => r.tags.create(TAG), target: (f) => f.tags.create },
  { label: "tags.delete", invoke: (r) => r.tags.delete(TAG.id), target: (f) => f.tags.delete },
  {
    label: "reviewStates.getAll",
    invoke: (r) => r.reviewStates.getAll(),
    target: (f) => f.reviewStates.getAll,
  },
  {
    label: "reviewStates.put",
    invoke: (r) => r.reviewStates.put(REVIEW_STATE),
    target: (f) => f.reviewStates.put,
  },
  {
    label: "reviewStates.putMany",
    invoke: (r) => r.reviewStates.putMany([REVIEW_STATE]),
    target: (f) => f.reviewStates.putMany,
  },
  {
    label: "reviewStates.delete",
    invoke: (r) => r.reviewStates.delete(REVIEW_STATE.phraseId),
    target: (f) => f.reviewStates.delete,
  },
];

/**
 * Invokes every repository method once and reports where each one landed, so
 * a mis-wired method shows up as a labelled diff rather than a bare count.
 */
async function recordRoutes(
  routed: Repositories,
  cloud: FakeRepositories,
  local: FakeRepositories
): Promise<string[]> {
  const routes: string[] = [];
  for (const call of REPOSITORY_CALLS) {
    await call.invoke(routed);
    const cloudCalls = call.target(cloud).mock.calls.length;
    const localCalls = call.target(local).mock.calls.length;
    routes.push(`${call.label} -> cloud:${cloudCalls} local:${localCalls}`);
  }
  return routes;
}

/** Labels of every method that was called on the given set. */
function calledLabels(repos: FakeRepositories): string[] {
  return REPOSITORY_CALLS.filter((call) => call.target(repos).mock.calls.length > 0).map(
    (call) => call.label
  );
}

describe("createSessionRoutedRepositories", () => {
  test("sends every repository method to the cloud set while a cloud user is signed in", async () => {
    // Arrange
    const cloud = createFakeRepositories();
    const local = createFakeRepositories();
    const routed = createSessionRoutedRepositories(cloud, local, () => true);

    // Act
    const routes = await recordRoutes(routed, cloud, local);

    // Assert
    expect(routes).toEqual(REPOSITORY_CALLS.map((call) => `${call.label} -> cloud:1 local:0`));
    expect(calledLabels(local)).toEqual([]);
  });

  test("sends every repository method to the local set while nobody is signed in", async () => {
    // Arrange
    const cloud = createFakeRepositories();
    const local = createFakeRepositories();
    const routed = createSessionRoutedRepositories(cloud, local, () => false);

    // Act
    const routes = await recordRoutes(routed, cloud, local);

    // Assert
    expect(routes).toEqual(REPOSITORY_CALLS.map((call) => `${call.label} -> cloud:0 local:1`));
    expect(calledLabels(cloud)).toEqual([]);
  });

  test("re-checks the session on every call, flipping all seven groups on one instance", async () => {
    // Arrange — one long-lived instance, as the app holds it for the session
    const cloud = createFakeRepositories();
    const local = createFakeRepositories();
    let signedIn = false;
    const routed = createSessionRoutedRepositories(cloud, local, () => signedIn);
    const allLocal = REPOSITORY_CALLS.map((call) => `${call.label} -> cloud:0 local:1`);
    const allCloud = REPOSITORY_CALLS.map((call) => `${call.label} -> cloud:1 local:0`);

    // Act + Assert — guest before the session restore lands
    expect(await recordRoutes(routed, cloud, local)).toEqual(allLocal);

    // Act + Assert — the same instance once the session arrives
    vi.clearAllMocks();
    signedIn = true;
    expect(await recordRoutes(routed, cloud, local)).toEqual(allCloud);

    // Act + Assert — and again after sign-out
    vi.clearAllMocks();
    signedIn = false;
    expect(await recordRoutes(routed, cloud, local)).toEqual(allLocal);
  });

  test("keeps a guest write in the local repository and never reaches the cloud repository", async () => {
    // Arrange
    const cloud = createFakeRepositories();
    const local = createFakeRepositories();
    const routed = createSessionRoutedRepositories(cloud, local, () => false);

    // Act
    await routed.phrases.put(PHRASE);
    await routed.conversations.addSession(SESSION);
    await routed.user.saveProfile(PROFILE);

    // Assert
    expect(local.phrases.put.mock.calls).toEqual([[PHRASE]]);
    expect(local.conversations.addSession.mock.calls).toEqual([[SESSION]]);
    expect(local.user.saveProfile.mock.calls).toEqual([[PROFILE]]);
    expect(calledLabels(cloud)).toEqual([]);
  });

  test("returns the delegate's resolved value to the caller", async () => {
    // Arrange
    const cloud = createFakeRepositories();
    const local = createFakeRepositories();
    local.phrases.getAll.mockResolvedValue([PHRASE]);
    cloud.phrases.getAll.mockResolvedValue([]);
    let signedIn = false;
    const routed = createSessionRoutedRepositories(cloud, local, () => signedIn);

    // Act + Assert
    await expect(routed.phrases.getAll()).resolves.toEqual([PHRASE]);
    signedIn = true;
    await expect(routed.phrases.getAll()).resolves.toEqual([]);
  });

  test("propagates a rejection from the active delegate instead of swallowing it", async () => {
    // Arrange
    const cloud = createFakeRepositories();
    const local = createFakeRepositories();
    local.phrases.put.mockRejectedValueOnce(new Error("QuotaExceededError"));
    const routed = createSessionRoutedRepositories(cloud, local, () => false);

    // Act + Assert
    await expect(routed.phrases.put(PHRASE)).rejects.toThrow("QuotaExceededError");
  });
});
