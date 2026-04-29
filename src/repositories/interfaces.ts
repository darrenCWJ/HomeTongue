import type { Phrase, Session, UserProfile, LessonProgress, ConversationLesson } from "../types";

export interface IPhraseRepository {
  getAll(): Promise<Phrase[]>;
  saveAll(phrases: Phrase[]): Promise<void>;
  toggleBookmark(id: string): Promise<Phrase[]>;
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
}

export interface Repositories {
  phrases: IPhraseRepository;
  conversations: IConversationRepository;
  user: IUserRepository;
  lessons: ILessonRepository;
  conversationLessons: IConversationLessonRepository;
}
