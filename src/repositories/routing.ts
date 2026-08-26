import type {
  ConversationLesson,
  LessonProgress,
  Phrase,
  PhraseReviewState,
  Session,
  Tag,
  UserProfile,
} from "../types";
import type {
  IConversationLessonRepository,
  IConversationRepository,
  ILessonRepository,
  IPhraseRepository,
  IReviewStateRepository,
  ITagRepository,
  IUserRepository,
  Repositories,
} from "./interfaces";

// Routes each repository call to the cloud or the local set based on whether
// somebody is signed in.
//
// In cloud builds the cloud repositories reject every call while there is no
// Supabase session ("Sign in to sync your data."), so a guest's reads threw and
// their writes were dropped — the outbox refuses to queue a write it cannot
// attribute to a user. The app promises guests the opposite ("Guest data stays
// on this device"), so they are routed to the local (Dexie) repositories.
//
// The choice is made PER CALL and never captured at construction time: the
// signed-in user is only known once the async session restore lands, and it
// changes again on every sign-in / sign-out while the same repository object
// stays mounted for the life of the module.
//
// This module must stay free of supabase/cloud imports — it only forwards to
// two already-constructed sets — so it is safe in local-mode bundles.

/** Resolves the repository to delegate to, evaluated fresh on each call. */
type Select<T> = () => T;

function routePhrases(select: Select<IPhraseRepository>): IPhraseRepository {
  return {
    getAll: () => select().getAll(),
    put: (phrase: Phrase) => select().put(phrase),
    putMany: (phrases: Phrase[]) => select().putMany(phrases),
  };
}

function routeConversations(select: Select<IConversationRepository>): IConversationRepository {
  return {
    getAll: () => select().getAll(),
    addSession: (session: Session) => select().addSession(session),
    updateSession: (session: Session) => select().updateSession(session),
    deleteSession: (id: string) => select().deleteSession(id),
  };
}

function routeUser(select: Select<IUserRepository>): IUserRepository {
  return {
    getProfile: () => select().getProfile(),
    saveProfile: (profile: UserProfile) => select().saveProfile(profile),
  };
}

function routeLessons(select: Select<ILessonRepository>): ILessonRepository {
  return {
    getAllProgress: () => select().getAllProgress(),
    updateProgress: (progress: LessonProgress) => select().updateProgress(progress),
  };
}

function routeConversationLessons(
  select: Select<IConversationLessonRepository>
): IConversationLessonRepository {
  return {
    getAll: () => select().getAll(),
    save: (lesson: ConversationLesson) => select().save(lesson),
    update: (lesson: ConversationLesson) => select().update(lesson),
    delete: (id: string) => select().delete(id),
  };
}

function routeTags(select: Select<ITagRepository>): ITagRepository {
  return {
    getAll: () => select().getAll(),
    create: (tag: Tag) => select().create(tag),
    delete: (id: string) => select().delete(id),
  };
}

function routeReviewStates(select: Select<IReviewStateRepository>): IReviewStateRepository {
  return {
    getAll: () => select().getAll(),
    put: (state: PhraseReviewState) => select().put(state),
    putMany: (states: PhraseReviewState[]) => select().putMany(states),
    delete: (phraseId: string) => select().delete(phraseId),
  };
}

/**
 * Wraps both repository sets in one facade whose every method delegates to the
 * cloud set while `hasCloudUser()` is true and to the local set otherwise.
 */
export function createSessionRoutedRepositories(
  cloud: Repositories,
  local: Repositories,
  hasCloudUser: () => boolean
): Repositories {
  const active = (): Repositories => (hasCloudUser() ? cloud : local);
  return {
    phrases: routePhrases(() => active().phrases),
    conversations: routeConversations(() => active().conversations),
    user: routeUser(() => active().user),
    lessons: routeLessons(() => active().lessons),
    conversationLessons: routeConversationLessons(() => active().conversationLessons),
    tags: routeTags(() => active().tags),
    reviewStates: routeReviewStates(() => active().reviewStates),
  };
}
