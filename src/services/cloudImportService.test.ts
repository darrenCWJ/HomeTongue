import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import type {
  ConversationLesson,
  LessonProgress,
  Phrase,
  PhraseReviewState,
  Session,
  Tag,
  UserProfile,
} from "../types";

// PROF-07: the caller needs to tell "this device has no local data at all"
// apart from "this device's data is already in the cloud" — both currently
// look identical (every imported count is 0). sourceCounts carries the total
// local row count per entity (independent of what's already in the cloud)
// so the caller can make that distinction.

const mocks = vi.hoisted(() => ({
  phraseGetAll: vi.fn(),
  phrasePutMany: vi.fn(),
  reviewGetAll: vi.fn(),
  reviewPutMany: vi.fn(),
  sessionGetAll: vi.fn(),
  sessionAdd: vi.fn(),
  tagGetAll: vi.fn(),
  tagCreate: vi.fn(),
  lessonGetAll: vi.fn(),
  lessonSave: vi.fn(),
  progressGetAll: vi.fn(),
  progressUpdate: vi.fn(),
  userGetProfile: vi.fn(),
  userSaveProfile: vi.fn(),
  dbPhrases: vi.fn(),
  dbReviewStates: vi.fn(),
  dbSessions: vi.fn(),
  dbTags: vi.fn(),
  dbConversationLessons: vi.fn(),
  dbLessonProgress: vi.fn(),
  dbProfileGet: vi.fn(),
}));

vi.mock("../repositories/cloud/CloudRepositories", () => ({
  CloudPhraseRepository: class {
    getAll = mocks.phraseGetAll;
    putMany = mocks.phrasePutMany;
  },
  CloudConversationRepository: class {
    getAll = mocks.sessionGetAll;
    addSession = mocks.sessionAdd;
  },
  CloudTagRepository: class {
    getAll = mocks.tagGetAll;
    create = mocks.tagCreate;
  },
  CloudConversationLessonRepository: class {
    getAll = mocks.lessonGetAll;
    save = mocks.lessonSave;
  },
  CloudLessonRepository: class {
    getAllProgress = mocks.progressGetAll;
    updateProgress = mocks.progressUpdate;
  },
  CloudUserRepository: class {
    getProfile = mocks.userGetProfile;
    saveProfile = mocks.userSaveProfile;
  },
}));

vi.mock("../repositories/cloud/CloudReviewStateRepository", () => ({
  CloudReviewStateRepository: class {
    getAll = mocks.reviewGetAll;
    putMany = mocks.reviewPutMany;
  },
}));

vi.mock("../repositories/local/db", () => ({
  db: {
    phrases: { toArray: mocks.dbPhrases },
    reviewStates: { toArray: mocks.dbReviewStates },
    sessions: { toArray: mocks.dbSessions },
    tags: { toArray: mocks.dbTags },
    conversationLessons: { toArray: mocks.dbConversationLessons },
    lessonProgress: { toArray: mocks.dbLessonProgress },
    profile: { get: mocks.dbProfileGet },
  },
}));

function makePhrase(id: string): Phrase {
  return { id, original: "o", dialect: "d", pronunciation: "p", isBookmarked: false, context: "" };
}
function makeReviewState(phraseId: string): PhraseReviewState {
  return {
    phraseId,
    due: "2026-01-01T00:00:00.000Z",
    intervalDays: 0,
    ease: 2.5,
    reps: 0,
    lapses: 0,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}
function makeSession(id: string): Session {
  return { id, date: "2026-01-01", messages: [] };
}
function makeTag(id: string): Tag {
  return { id, name: "n", type: "phrase", createdAt: "2026-01-01T00:00:00.000Z" };
}
function makeLesson(id: string): ConversationLesson {
  return {
    id,
    sessionId: "s1",
    title: "t",
    createdAt: "2026-01-01T00:00:00.000Z",
    vocabulary: [],
    examCompleted: false,
    examAttempts: 0,
  };
}
function makeProgress(lessonId: string): LessonProgress {
  return { lessonId, completedLevels: 0, totalLevels: 1, lastAccessedAt: "2026-01-01T00:00:00.000Z" };
}
function makeProfile(): UserProfile {
  return {
    id: "p1",
    name: "n",
    preferredDialect: "d",
    preferredTone: "casual",
    toneOverrideEnabled: false,
    personalityNotes: "",
    conversationCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

type CloudImportModule = typeof import("./cloudImportService");
let importLocalDataToCloud: CloudImportModule["importLocalDataToCloud"];

beforeAll(async () => {
  // The module's cloud-vs-disabled gate reads import.meta.env directly (same
  // static-gate pattern as src/lib/authGateway.ts) and is evaluated at
  // module-load time. CI runs with no VITE_SUPABASE_* vars set, so the
  // gate must be stubbed BEFORE the module is first loaded — a dynamic
  // import (not a hoisted static one) is what makes that ordering possible.
  vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
  ({ importLocalDataToCloud } = await import("./cloudImportService"));
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.phraseGetAll.mockResolvedValue([]);
  mocks.phrasePutMany.mockResolvedValue(undefined);
  mocks.reviewGetAll.mockResolvedValue([]);
  mocks.reviewPutMany.mockResolvedValue(undefined);
  mocks.sessionGetAll.mockResolvedValue([]);
  mocks.sessionAdd.mockResolvedValue(undefined);
  mocks.tagGetAll.mockResolvedValue([]);
  mocks.tagCreate.mockResolvedValue(undefined);
  mocks.lessonGetAll.mockResolvedValue([]);
  mocks.lessonSave.mockResolvedValue(undefined);
  mocks.progressGetAll.mockResolvedValue({});
  mocks.progressUpdate.mockResolvedValue(undefined);
  mocks.userGetProfile.mockResolvedValue(null);
  mocks.userSaveProfile.mockResolvedValue(undefined);
  mocks.dbPhrases.mockResolvedValue([]);
  mocks.dbReviewStates.mockResolvedValue([]);
  mocks.dbSessions.mockResolvedValue([]);
  mocks.dbTags.mockResolvedValue([]);
  mocks.dbConversationLessons.mockResolvedValue([]);
  mocks.dbLessonProgress.mockResolvedValue([]);
  mocks.dbProfileGet.mockResolvedValue(undefined);
});

describe("importLocalDataToCloud", () => {
  test("returns all-zero imported and source counts when every local store is empty", async () => {
    const result = await importLocalDataToCloud();

    expect(result).toEqual({
      phrases: 0,
      reviewStates: 0,
      sessions: 0,
      tags: 0,
      conversationLessons: 0,
      lessonProgress: 0,
      profile: 0,
      sourceCounts: {
        phrases: 0,
        reviewStates: 0,
        sessions: 0,
        tags: 0,
        conversationLessons: 0,
        lessonProgress: 0,
        profile: 0,
      },
    });
  });

  test("sourceCounts reports every local row while the top-level counts report only what was newly imported", async () => {
    const existingPhrase = makePhrase("phrase-existing");
    const newPhrase = makePhrase("phrase-new");
    mocks.dbPhrases.mockResolvedValue([existingPhrase, newPhrase]);
    mocks.phraseGetAll.mockResolvedValue([existingPhrase]);

    const existingReview = makeReviewState("phrase-existing");
    const newReview = makeReviewState("phrase-new");
    mocks.dbReviewStates.mockResolvedValue([existingReview, newReview]);
    mocks.reviewGetAll.mockResolvedValue([existingReview]);

    const existingSession = makeSession("session-existing");
    const newSession = makeSession("session-new");
    mocks.dbSessions.mockResolvedValue([existingSession, newSession]);
    mocks.sessionGetAll.mockResolvedValue([existingSession]);

    const existingTag = makeTag("tag-existing");
    const newTag = makeTag("tag-new");
    mocks.dbTags.mockResolvedValue([existingTag, newTag]);
    mocks.tagGetAll.mockResolvedValue([existingTag]);

    const existingLesson = makeLesson("lesson-existing");
    const newLesson = makeLesson("lesson-new");
    mocks.dbConversationLessons.mockResolvedValue([existingLesson, newLesson]);
    mocks.lessonGetAll.mockResolvedValue([existingLesson]);

    const existingProgress = makeProgress("lesson-existing");
    const newProgress = makeProgress("lesson-new");
    mocks.dbLessonProgress.mockResolvedValue([existingProgress, newProgress]);
    mocks.progressGetAll.mockResolvedValue({ "lesson-existing": existingProgress });

    const localProfile = makeProfile();
    mocks.dbProfileGet.mockResolvedValue({ key: "singleton", value: localProfile });
    // The cloud already has a profile, so the local one must NOT be imported —
    // sourceCounts.profile must still report 1 (a local profile exists).
    mocks.userGetProfile.mockResolvedValue(makeProfile());

    const result = await importLocalDataToCloud();

    expect(result).toEqual({
      phrases: 1,
      reviewStates: 1,
      sessions: 1,
      tags: 1,
      conversationLessons: 1,
      lessonProgress: 1,
      profile: 0,
      sourceCounts: {
        phrases: 2,
        reviewStates: 2,
        sessions: 2,
        tags: 2,
        conversationLessons: 2,
        lessonProgress: 2,
        profile: 1,
      },
    });
    expect(mocks.phrasePutMany).toHaveBeenCalledWith([newPhrase]);
    expect(mocks.userSaveProfile).not.toHaveBeenCalled();
  });
});
