import type {
  ConversationLesson,
  LessonProgress,
  Phrase,
  PhraseReviewState,
  Session,
  Tag,
  UserProfile,
} from "../../types";
import type {
  IConversationLessonRepository,
  IConversationRepository,
  ILessonRepository,
  IPhraseRepository,
  IReviewStateRepository,
  ITagRepository,
  IUserRepository,
  Repositories,
} from "../interfaces";
import { authGateway } from "../../lib/authGateway";
import {
  enqueueWrite,
  isOutboxHeld,
  registerOutboxReplay,
  setOutboxUser,
  triggerOutboxFlush,
} from "./outboxStore";
import type { OutboxEntity, OutboxEntry, OutboxOp } from "./types";

// Outbox decorator over the CLOUD repositories (local mode is already
// durable — Dexie writes don't fail on connectivity). Reads pass through
// untouched. Writes:
//   - in hold mode (initial load failed), skip the network and enqueue;
//   - otherwise attempt the cloud write and, on ANY failure, enqueue the
//     write and RESOLVE — the caller's optimistic in-memory update already
//     happened, and the queued write flushes later (see outboxStore.ts).
//
// NOTE: cloudImportService deliberately bypasses this decorator by
// instantiating the cloud repositories directly — the one-shot import wants
// hard failures, not deferred syncing.

function guarded(
  entity: OutboxEntity,
  op: OutboxOp,
  payload: unknown,
  write: () => Promise<void>
): Promise<void> {
  if (isOutboxHeld()) {
    return enqueueWrite(entity, op, payload);
  }
  return write().catch((err) => {
    console.error(`[outbox] cloud ${entity}.${op} failed — queued for retry`, err);
    return enqueueWrite(entity, op, payload);
  });
}

function wrapPhrases(inner: IPhraseRepository): IPhraseRepository {
  return {
    getAll: () => inner.getAll(),
    put: (phrase: Phrase) => guarded("phrase", "put", phrase, () => inner.put(phrase)),
    putMany: (phrases: Phrase[]) => guarded("phrase", "putMany", phrases, () => inner.putMany(phrases)),
  };
}

function wrapConversations(inner: IConversationRepository): IConversationRepository {
  return {
    getAll: () => inner.getAll(),
    // addSession and updateSession are the same id-keyed upsert in the cloud
    // repo, so both replay through updateSession (see createReplay).
    addSession: (session: Session) => guarded("session", "put", session, () => inner.addSession(session)),
    updateSession: (session: Session) =>
      guarded("session", "put", session, () => inner.updateSession(session)),
    deleteSession: (id: string) => guarded("session", "delete", id, () => inner.deleteSession(id)),
  };
}

function wrapUser(inner: IUserRepository): IUserRepository {
  return {
    getProfile: () => inner.getProfile(),
    saveProfile: (profile: UserProfile) =>
      guarded("profile", "put", profile, () => inner.saveProfile(profile)),
  };
}

function wrapLessons(inner: ILessonRepository): ILessonRepository {
  return {
    getAllProgress: () => inner.getAllProgress(),
    updateProgress: (progress: LessonProgress) =>
      guarded("progress", "put", progress, () => inner.updateProgress(progress)),
  };
}

function wrapConversationLessons(inner: IConversationLessonRepository): IConversationLessonRepository {
  return {
    getAll: () => inner.getAll(),
    // save and update are the same id-keyed upsert in the cloud repo, so both
    // replay through update (see createReplay).
    save: (lesson: ConversationLesson) =>
      guarded("conversationLesson", "put", lesson, () => inner.save(lesson)),
    update: (lesson: ConversationLesson) =>
      guarded("conversationLesson", "put", lesson, () => inner.update(lesson)),
    delete: (id: string) => guarded("conversationLesson", "delete", id, () => inner.delete(id)),
  };
}

function wrapTags(inner: ITagRepository): ITagRepository {
  return {
    getAll: () => inner.getAll(),
    create: (tag: Tag) => guarded("tag", "put", tag, () => inner.create(tag)),
    delete: (id: string) => guarded("tag", "delete", id, () => inner.delete(id)),
  };
}

function wrapReviewStates(inner: IReviewStateRepository): IReviewStateRepository {
  return {
    getAll: () => inner.getAll(),
    put: (state: PhraseReviewState) => guarded("reviewState", "put", state, () => inner.put(state)),
    putMany: (states: PhraseReviewState[]) =>
      guarded("reviewState", "putMany", states, () => inner.putMany(states)),
    delete: (phraseId: string) => guarded("reviewState", "delete", phraseId, () => inner.delete(phraseId)),
  };
}

/**
 * Replays one queued entry against the inner (cloud) repositories. Payload
 * casts mirror exactly what `guarded` captured for each entity/op pair.
 * Unknown combinations reject so the entry burns its attempts and is
 * eventually dropped instead of wedging the queue.
 */
function createReplay(inner: Repositories): (entry: OutboxEntry) => Promise<void> {
  return (entry: OutboxEntry): Promise<void> => {
    const { entity, op, payload } = entry;
    switch (entity) {
      case "phrase":
        if (op === "put") return inner.phrases.put(payload as Phrase);
        if (op === "putMany") return inner.phrases.putMany(payload as Phrase[]);
        break;
      case "session":
        if (op === "put") return inner.conversations.updateSession(payload as Session);
        if (op === "delete") return inner.conversations.deleteSession(payload as string);
        break;
      case "profile":
        if (op === "put") return inner.user.saveProfile(payload as UserProfile);
        break;
      case "progress":
        if (op === "put") return inner.lessons.updateProgress(payload as LessonProgress);
        break;
      case "conversationLesson":
        if (op === "put") return inner.conversationLessons.update(payload as ConversationLesson);
        if (op === "delete") return inner.conversationLessons.delete(payload as string);
        break;
      case "tag":
        if (op === "put") return inner.tags.create(payload as Tag);
        if (op === "delete") return inner.tags.delete(payload as string);
        break;
      case "reviewState":
        if (op === "put") return inner.reviewStates.put(payload as PhraseReviewState);
        if (op === "putMany") return inner.reviewStates.putMany(payload as PhraseReviewState[]);
        if (op === "delete") return inner.reviewStates.delete(payload as string);
        break;
    }
    return Promise.reject(new Error(`Unknown outbox entry ${entity}.${op}`));
  };
}

/**
 * Wraps the cloud repositories with the outbox decorator and wires the flush
 * triggers (auth user tracking + window "online"). Called exactly once, from
 * the repository factory's cloud branch.
 */
export function createOutboxRepositories(inner: Repositories): Repositories {
  registerOutboxReplay(createReplay(inner));

  // Track the signed-in user for per-user entry isolation; a (re)appearing
  // user also triggers a flush of their held entries (app start / sign-in).
  authGateway.onAuthUserChange((user) => setOutboxUser(user?.id ?? null));
  authGateway
    .getSessionUser()
    .then((user) => setOutboxUser(user?.id ?? null))
    .catch(() => setOutboxUser(null));

  if (typeof window !== "undefined") {
    window.addEventListener("online", () => {
      void triggerOutboxFlush();
    });
  }

  return {
    phrases: wrapPhrases(inner.phrases),
    conversations: wrapConversations(inner.conversations),
    user: wrapUser(inner.user),
    lessons: wrapLessons(inner.lessons),
    conversationLessons: wrapConversationLessons(inner.conversationLessons),
    tags: wrapTags(inner.tags),
    reviewStates: wrapReviewStates(inner.reviewStates),
  };
}
