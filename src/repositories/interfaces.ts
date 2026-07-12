import type { Phrase, Session, UserProfile, LessonProgress, ConversationLesson, Tag } from "../types";

export interface IPhraseRepository {
  getAll(): Promise<Phrase[]>;
  /** Insert or update a single phrase (upsert). Never deletes other rows. */
  put(phrase: Phrase): Promise<void>;
  /**
   * Insert or update several phrases in one write (upsert-only).
   * Unlike the removed replace-all saveAll, this NEVER prunes rows that are
   * absent from the list — required for safe multi-device cloud sync.
   */
  putMany(phrases: Phrase[]): Promise<void>;
}

export interface IConversationRepository {
  getAll(): Promise<Session[]>;
  addSession(session: Session): Promise<void>;
  updateSession(session: Session): Promise<void>;
  deleteSession(id: string): Promise<void>;
}

export interface IUserRepository {
  getProfile(): Promise<UserProfile | null>;
  saveProfile(profile: UserProfile): Promise<void>;
}

export interface ILessonRepository {
  getAllProgress(): Promise<Record<string, LessonProgress>>;
  updateProgress(progress: LessonProgress): Promise<void>;
}

export interface IConversationLessonRepository {
  getAll(): Promise<ConversationLesson[]>;
  save(lesson: ConversationLesson): Promise<void>;
  update(lesson: ConversationLesson): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface ITagRepository {
  getAll(): Promise<Tag[]>;
  create(tag: Tag): Promise<void>;
  delete(id: string): Promise<void>;
}

// Separate import line (rather than extending the list above) to keep this
// change purely additive alongside concurrent edits to this file.
import type { PhraseReviewState } from "../types";

/** Spaced-repetition schedules for saved phrases, keyed by phraseId. */
export interface IReviewStateRepository {
  getAll(): Promise<PhraseReviewState[]>;
  /** Insert or update the schedule for one phrase (upsert). */
  put(state: PhraseReviewState): Promise<void>;
  delete(phraseId: string): Promise<void>;
}

export interface Repositories {
  phrases: IPhraseRepository;
  conversations: IConversationRepository;
  user: IUserRepository;
  lessons: ILessonRepository;
  conversationLessons: IConversationLessonRepository;
  tags: ITagRepository;
  reviewStates: IReviewStateRepository;
}
