import type { Phrase, Session, UserProfile, LessonProgress } from "../../types";
import type {
  IPhraseRepository,
  IConversationRepository,
  IUserRepository,
  ILessonRepository,
} from "../interfaces";

const NOT_CONFIGURED =
  "Cloud mode not yet configured. Set VITE_STORAGE_MODE=local or configure Supabase.";

export class CloudPhraseRepository implements IPhraseRepository {
  async getAll(): Promise<Phrase[]> {
    throw new Error(NOT_CONFIGURED);
  }
  async saveAll(_phrases: Phrase[]): Promise<void> {
    throw new Error(NOT_CONFIGURED);
  }
  async toggleBookmark(_id: string): Promise<Phrase[]> {
    throw new Error(NOT_CONFIGURED);
  }
}

export class CloudConversationRepository implements IConversationRepository {
  async getAll(): Promise<Session[]> {
    throw new Error(NOT_CONFIGURED);
  }
  async addSession(_session: Session): Promise<void> {
    throw new Error(NOT_CONFIGURED);
  }
}

export class CloudUserRepository implements IUserRepository {
  async getProfile(): Promise<UserProfile | null> {
    throw new Error(NOT_CONFIGURED);
  }
  async saveProfile(_profile: UserProfile): Promise<void> {
    throw new Error(NOT_CONFIGURED);
  }
}

export class CloudLessonRepository implements ILessonRepository {
  async getAllProgress(): Promise<Record<string, LessonProgress>> {
    throw new Error(NOT_CONFIGURED);
  }
  async updateProgress(_progress: LessonProgress): Promise<void> {
    throw new Error(NOT_CONFIGURED);
  }
}
