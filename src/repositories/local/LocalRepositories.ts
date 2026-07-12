import type { Phrase, Session, UserProfile, LessonProgress, ConversationLesson, Tag } from "../../types";
import type {
  IPhraseRepository,
  IConversationRepository,
  IUserRepository,
  ILessonRepository,
  IConversationLessonRepository,
  ITagRepository,
} from "../interfaces";
import { db } from "./db";

export class LocalPhraseRepository implements IPhraseRepository {
  async getAll(): Promise<Phrase[]> {
    return db.phrases.toArray();
  }

  async put(phrase: Phrase): Promise<void> {
    await db.phrases.put(phrase);
  }

  async putMany(phrases: Phrase[]): Promise<void> {
    if (phrases.length === 0) return;
    await db.phrases.bulkPut(phrases);
  }
}

// `date` is a locale-formatted string, so a Dexie index on it sorts
// lexicographically (wrong across months). Sort by the ISO createdAt,
// falling back to parsing the display date for old records.
export function sortSessionsNewestFirst(sessions: Session[]): Session[] {
  const sortKey = (s: Session) => {
    const parsed = s.createdAt ? Date.parse(s.createdAt) : Date.parse(s.date);
    return Number.isNaN(parsed) ? 0 : parsed;
  };
  return [...sessions].sort((a, b) => sortKey(b) - sortKey(a));
}

export class LocalConversationRepository implements IConversationRepository {
  async getAll(): Promise<Session[]> {
    return sortSessionsNewestFirst(await db.sessions.toArray());
  }

  async addSession(session: Session): Promise<void> {
    await db.sessions.put(session);
  }

  async updateSession(session: Session): Promise<void> {
    await db.sessions.put(session);
  }

  async deleteSession(id: string): Promise<void> {
    await db.sessions.delete(id);
  }
}

export class LocalUserRepository implements IUserRepository {
  async getProfile(): Promise<UserProfile | null> {
    const row = await db.profile.get("singleton");
    return row?.value ?? null;
  }

  async saveProfile(profile: UserProfile): Promise<void> {
    await db.profile.put({ key: "singleton", value: profile });
  }
}

export class LocalLessonRepository implements ILessonRepository {
  async getAllProgress(): Promise<Record<string, LessonProgress>> {
    const rows = await db.lessonProgress.toArray();
    return Object.fromEntries(rows.map((r) => [r.lessonId, r]));
  }

  async updateProgress(progress: LessonProgress): Promise<void> {
    await db.lessonProgress.put(progress);
  }
}

export class LocalConversationLessonRepository implements IConversationLessonRepository {
  async getAll(): Promise<ConversationLesson[]> {
    return db.conversationLessons.toArray();
  }

  async save(lesson: ConversationLesson): Promise<void> {
    await db.conversationLessons.put(lesson);
  }

  async update(lesson: ConversationLesson): Promise<void> {
    await db.conversationLessons.put(lesson);
  }

  async delete(id: string): Promise<void> {
    await db.conversationLessons.delete(id);
  }
}

export const DEFAULT_TAGS: Tag[] = [
  { id: "p-greetings", name: "Greetings", type: "phrase", createdAt: "2024-01-01T00:00:00.000Z" },
  { id: "p-food", name: "Food & Dining", type: "phrase", createdAt: "2024-01-01T00:00:00.000Z" },
  { id: "p-transport", name: "Transport", type: "phrase", createdAt: "2024-01-01T00:00:00.000Z" },
  { id: "p-shopping", name: "Shopping", type: "phrase", createdAt: "2024-01-01T00:00:00.000Z" },
  { id: "p-weather", name: "Weather", type: "phrase", createdAt: "2024-01-01T00:00:00.000Z" },
  { id: "s-daily", name: "Daily Life", type: "session", createdAt: "2024-01-01T00:00:00.000Z" },
  { id: "s-travel", name: "Travel", type: "session", createdAt: "2024-01-01T00:00:00.000Z" },
  { id: "s-work", name: "Work", type: "session", createdAt: "2024-01-01T00:00:00.000Z" },
  { id: "s-social", name: "Social", type: "session", createdAt: "2024-01-01T00:00:00.000Z" },
];

export class LocalTagRepository implements ITagRepository {
  async getAll(): Promise<Tag[]> {
    const tags = await db.tags.toArray();
    if (tags.length === 0) {
      await db.tags.bulkPut(DEFAULT_TAGS);
      return DEFAULT_TAGS;
    }
    return tags;
  }

  async create(tag: Tag): Promise<void> {
    await db.tags.put(tag);
  }

  async delete(id: string): Promise<void> {
    await db.tags.delete(id);
  }
}
